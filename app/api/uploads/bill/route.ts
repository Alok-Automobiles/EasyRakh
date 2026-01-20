import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { uploadBuffer } from '@/lib/cloudinary';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rateLimit';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

export async function POST(request: NextRequest) {
  // Rate limiting for upload endpoints (stricter)
  const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.upload);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit. For images, try refreshing the page and uploading again.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await uploadBuffer(buffer, {
      folder: `ledger-bills/${userId}`,
      resource_type: file.type === 'application/pdf' ? 'raw' : 'image',
      public_id: `${Date.now()}-${file.name.replace(/\s+/g, '-')}`,
      overwrite: false,
    });

    return NextResponse.json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      resourceType: uploadResult.resource_type,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
    });
  } catch (error) {
    console.error('Bill upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}


