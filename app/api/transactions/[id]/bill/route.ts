import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { cloudinaryAssetsFromFields } from '@/lib/cloudinary-cleanup';
import { downloadRawAsset } from '@/lib/cloudinary';
import { getDb } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function pdfFilename(publicId: string) {
  const rawName = publicId.split('/').pop() || 'bill.pdf';
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
  return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
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
      return NextResponse.json({ error: 'Invalid transaction ID' }, { status: 400 });
    }

    const db = await getDb();
    const transaction = await db.collection('transactions').findOne(
      { _id: new ObjectId(id), userId },
      { projection: { billUrl: 1, billPublicId: 1, invoiceId: 1, description: 1 } }
    );

    if (!transaction) {
      return NextResponse.json({ error: 'Bill attachment not found' }, { status: 404 });
    }

    let billUrl = transaction.billUrl;
    let billPublicId = transaction.billPublicId;
    if (
      !billUrl &&
      (transaction.invoiceId || /^Invoice\s+/i.test(transaction.description || ''))
    ) {
      const invoice = await db.collection('invoices').findOne(
        {
          userId,
          $or: [
            { transactionId: id },
            { 'payments.ledgerTransactionId': id },
          ],
        },
        { projection: { pdfUrl: 1, pdfPublicId: 1 } }
      );
      billUrl = invoice?.pdfUrl;
      billPublicId = invoice?.pdfPublicId;
    }

    const [asset] = cloudinaryAssetsFromFields({
      publicIds: [billPublicId],
      urls: [billUrl],
    });
    if (!asset || asset.resourceType !== 'raw' || !/\.pdf$/i.test(asset.publicId)) {
      return NextResponse.json({ error: 'PDF attachment not found' }, { status: 404 });
    }

    const downloaded = await downloadRawAsset(asset.publicId);
    if (downloaded.buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Cloudinary returned an invalid PDF');
    }

    return new NextResponse(new Uint8Array(downloaded.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(downloaded.buffer.length),
        'Content-Disposition': `inline; filename="${pdfFilename(asset.publicId)}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Transaction bill download error:', error);
    return NextResponse.json(
      { error: 'Failed to load the bill attachment' },
      { status: 502 }
    );
  }
}
