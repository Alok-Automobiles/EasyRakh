/**
 * Client-side image compression utility
 * Compresses images to fit within the specified max size while maintaining quality
 */

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB target size
const MIN_QUALITY = 0.1; // Minimum quality to prevent over-compression
const QUALITY_STEP = 0.1; // Quality reduction step

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

/**
 * Check if a file is an image that can be compressed
 */
export function isCompressibleImage(file: File): boolean {
  const compressibleTypes = ['image/jpeg', 'image/png', 'image/webp'];
  return compressibleTypes.includes(file.type);
}

/**
 * Convert a file to a data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Load an image from a data URL
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Convert a canvas to a Blob with specified quality
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 * Reduces dimensions if needed for very large images
 */
function calculateDimensions(
  width: number,
  height: number,
  maxDimension: number = 4096
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const ratio = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Compress an image file to fit within the max size limit
 * Uses iterative quality reduction until the target size is achieved
 */
export async function compressImage(
  file: File,
  maxSizeBytes: number = MAX_SIZE_BYTES
): Promise<CompressionResult> {
  const originalSize = file.size;

  // If file is already under the limit and is a supported image, return as-is
  if (file.size <= maxSizeBytes) {
    return {
      file,
      originalSize,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  // If it's not a compressible image type (e.g., PDF, HEIC), return as-is
  // The server will handle the rejection
  if (!isCompressibleImage(file)) {
    return {
      file,
      originalSize,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  // Load the image
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  // Calculate dimensions (reduce if image is very large)
  const { width, height } = calculateDimensions(img.width, img.height);

  // Create canvas and draw image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0, width, height);

  // Determine output format (prefer JPEG for photos as it compresses better)
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  
  // Start with high quality and reduce until we're under the limit
  let quality = 0.9;
  let blob: Blob;

  do {
    blob = await canvasToBlob(canvas, outputType, quality);
    
    if (blob.size <= maxSizeBytes) {
      break;
    }

    quality -= QUALITY_STEP;

    // If we've gone too low on quality, try reducing dimensions
    if (quality < MIN_QUALITY && canvas.width > 800) {
      const newWidth = Math.round(canvas.width * 0.8);
      const newHeight = Math.round(canvas.height * 0.8);
      
      // Create a new canvas with smaller dimensions
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = newWidth;
      tempCanvas.height = newHeight;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.drawImage(tempCanvas, 0, 0);
      }
      
      quality = 0.7; // Reset quality after dimension reduction
    }
  } while (blob.size > maxSizeBytes && quality >= MIN_QUALITY);

  // Create a new File from the blob
  const extension = outputType === 'image/png' ? 'png' : 'jpg';
  const newFileName = file.name.replace(/\.[^/.]+$/, '') + `_compressed.${extension}`;
  
  const compressedFile = new File([blob], newFileName, {
    type: outputType,
    lastModified: Date.now(),
  });

  return {
    file: compressedFile,
    originalSize,
    compressedSize: compressedFile.size,
    wasCompressed: true,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
