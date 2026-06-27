import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';

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

export async function deleteAsset(publicId: string, resourceType: 'image' | 'raw' | 'video' = 'image') {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

