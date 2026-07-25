import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { cloudinaryAssetsFromFields } from '@/lib/cloudinary-cleanup';
import { downloadRawAsset } from '@/lib/cloudinary';
import {
  buildInvoicePdfBuffer,
  isSellerSnapshotComplete,
  sellerSnapshotFromUser,
} from '@/lib/invoice-pdf';
import { getDb } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function invoiceFilename(invoiceNumber: string) {
  const safeNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${safeNumber || 'invoice'}.pdf`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const db = await getDb();
    const invoice = await db.collection('invoices').findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    let pdfBuffer: Buffer | undefined;
    const [storedAsset] = cloudinaryAssetsFromFields({
      publicIds: [invoice.pdfPublicId],
      urls: [invoice.pdfUrl],
    });

    if (
      storedAsset?.resourceType === 'raw' &&
      /\.pdf$/i.test(storedAsset.publicId)
    ) {
      try {
        const downloaded = await downloadRawAsset(storedAsset.publicId);
        if (downloaded.buffer.subarray(0, 5).toString() === '%PDF-') {
          pdfBuffer = downloaded.buffer;
        }
      } catch (error) {
        console.warn('Stored invoice PDF could not be downloaded; regenerating it:', error);
      }
    }

    if (!pdfBuffer) {
      let sellerSnapshot = invoice.sellerSnapshot;

      if (!isSellerSnapshotComplete(sellerSnapshot)) {
        const user = ObjectId.isValid(userId)
          ? await db.collection('users').findOne({ _id: new ObjectId(userId) })
          : null;
        sellerSnapshot = user ? sellerSnapshotFromUser(user) : undefined;
      }

      if (!isSellerSnapshotComplete(sellerSnapshot)) {
        return NextResponse.json(
          {
            error: 'Complete your firm details before downloading this invoice.',
            code: 'FIRM_DETAILS_REQUIRED',
          },
          { status: 409 }
        );
      }

      pdfBuffer = buildInvoicePdfBuffer({
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        items: invoice.items || [],
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        status: invoice.status,
        notes: invoice.notes,
        createdAt: invoice.createdAt,
        sellerSnapshot,
      });
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Content-Disposition': `attachment; filename="${invoiceFilename(invoice.invoiceNumber)}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Invoice download error:', error);
    return NextResponse.json(
      { error: 'Failed to download invoice' },
      { status: 500 }
    );
  }
}
