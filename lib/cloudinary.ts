import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';

export type CloudinaryResourceType = 'image' | 'raw' | 'video';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY ?? process.env.API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET ?? process.env.API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error('Cloudinary environment variables are not configured properly.');
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export async function uploadBuffer(
  buffer: Buffer,
  options: UploadApiOptions = {}
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'ledger-bills', resource_type: 'image', ...options },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Failed to upload to Cloudinary'));
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

export async function deleteAsset(publicId: string, resourceType: CloudinaryResourceType = 'image') {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

export async function downloadRawAsset(publicId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const downloadUrl = cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'upload',
    expires_at: expiresAt,
  });
  const response = await fetch(downloadUrl, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Cloudinary download failed with status ${response.status}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}
