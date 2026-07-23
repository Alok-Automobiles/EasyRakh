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
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: recordId, entryId } = await params;
    if (!ObjectId.isValid(recordId) || !ObjectId.isValid(entryId)) {
      return NextResponse.json({ error: 'Invalid cash record or entry ID' }, { status: 400 });
    }

    const recordObjectId = new ObjectId(recordId);
    const entryObjectId = new ObjectId(entryId);
    const db = await getDb();
    const record = await db.collection('dailyCashRecords').findOne(
      {
        _id: recordObjectId,
        userId,
        'entries._id': entryObjectId,
      },
      {
        projection: {
          entries: { $elemMatch: { _id: entryObjectId } },
        },
      }
    );
    const entry = record?.entries?.[0];

    if (!entry) {
      return NextResponse.json({ error: 'Bill attachment not found' }, { status: 404 });
    }

    const [asset] = cloudinaryAssetsFromFields({
      publicIds: [entry.billPublicId],
      urls: [entry.billUrl],
    });
    if (
      !asset ||
      asset.resourceType !== 'raw' ||
      !/\.pdf$/i.test(asset.publicId)
    ) {
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
    console.error('Cash record bill download error:', error);
    return NextResponse.json(
      { error: 'Failed to load the bill attachment' },
      { status: 502 }
    );
  }
}
