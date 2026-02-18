import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { uploadBuffer } from '@/lib/cloudinary';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rateLimit';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 200;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
  'image/webp': [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
};

function detectFileType(buffer: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    for (const sig of signatures) {
      if (buffer.length < sig.offset + sig.bytes.length) continue;
      const match = sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
      if (match) return mime;
    }
  }
  return null;
}

function sanitizeFilename(name: string): string {
  const base = name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_FILENAME_LENGTH);
  return base || 'upload';
}

export async function POST(request: NextRequest) {
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

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const detectedType = detectFileType(buffer);
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif';
    if (!isHeic && detectedType !== null && detectedType !== file.type) {
      return NextResponse.json(
        { error: 'File content does not match its declared type.' },
        { status: 400 }
      );
    }
    if (!isHeic && detectedType === null && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unable to verify file type. Please upload a valid image or PDF.' },
        { status: 400 }
      );
    }

    const safeName = sanitizeFilename(file.name);

    const uploadResult = await uploadBuffer(buffer, {
      folder: `ledger-bills/${userId}`,
      resource_type: file.type === 'application/pdf' ? 'raw' : 'image',
      public_id: `${Date.now()}-${safeName}`,
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


