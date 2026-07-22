type UploadedPdfAsset = { publicId: string };

export function transactionCommitMayBeUnknown(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    hasErrorLabel?: (label: string) => boolean;
    errorLabels?: unknown;
  };
  if (candidate.hasErrorLabel?.('UnknownTransactionCommitResult')) return true;
  return Array.isArray(candidate.errorLabels) &&
    candidate.errorLabels.includes('UnknownTransactionCommitResult');
}

export async function cleanupInvoicePdfUploads(
  uploads: UploadedPdfAsset[],
  keepPublicId?: string,
  context = 'invoice PDF'
) {
  const publicIds = Array.from(new Set(
    uploads
      .map((upload) => upload.publicId)
      .filter((publicId) => publicId && publicId !== keepPublicId)
  ));
  if (publicIds.length === 0) return;

  const { deleteAsset } = await import('./cloudinary');
  for (const publicId of publicIds) {
    try {
      await deleteAsset(publicId, 'raw');
    } catch (error) {
      // The database state is already safe. Log storage cleanup failures so an
      // orphaned file can be removed later without failing the financial action.
      console.error(`Failed to clean up ${context}:`, error);
    }
  }
}
