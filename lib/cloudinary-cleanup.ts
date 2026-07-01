export type CloudinaryResourceType = 'image' | 'raw' | 'video';

export type CloudinaryAssetRef = {
  publicId: string;
  resourceType?: CloudinaryResourceType;
};

function normalizePublicId(publicId?: string | null) {
  const trimmed = publicId?.trim();
  return trimmed || undefined;
}

function resourceTypeFromPublicId(publicId: string): CloudinaryResourceType | undefined {
  return /\.pdf$/i.test(publicId) ? 'raw' : undefined;
}

function resourceTypeFromUrl(url?: string | null): CloudinaryResourceType | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const resourceType = parts[1];
    if (resourceType === 'image' || resourceType === 'raw' || resourceType === 'video') {
      return resourceType;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function cloudinaryAssetFromUrl(url?: string | null): CloudinaryAssetRef | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const resourceType = parts[1];
    const uploadIndex = parts.indexOf('upload');

    if (
      uploadIndex === -1 ||
      (resourceType !== 'image' && resourceType !== 'raw' && resourceType !== 'video')
    ) {
      return null;
    }

    const publicIdParts = parts.slice(uploadIndex + 1);
    if (publicIdParts[0]?.match(/^v\d+$/)) {
      publicIdParts.shift();
    }

    let publicId = decodeURIComponent(publicIdParts.join('/'));
    if (!publicId) return null;

    if (resourceType === 'image' || resourceType === 'video') {
      publicId = publicId.replace(/\.[^.\/]+$/, '');
    }

    return { publicId, resourceType };
  } catch {
    return null;
  }
}

export function cloudinaryAssetsFromFields({
  publicIds = [],
  urls = [],
  defaultResourceType = 'image',
}: {
  publicIds?: Array<string | null | undefined>;
  urls?: Array<string | null | undefined>;
  defaultResourceType?: CloudinaryResourceType;
}): CloudinaryAssetRef[] {
  const refs: CloudinaryAssetRef[] = [];

  publicIds.forEach((publicId, index) => {
    const normalized = normalizePublicId(publicId);
    if (!normalized) return;

    refs.push({
      publicId: normalized,
      resourceType:
        resourceTypeFromUrl(urls[index]) ??
        resourceTypeFromPublicId(normalized) ??
        defaultResourceType,
    });
  });

  urls.forEach((url, index) => {
    if (normalizePublicId(publicIds[index])) return;

    const parsed = cloudinaryAssetFromUrl(url);
    if (parsed) refs.push(parsed);
  });

  return refs;
}

export async function deleteCloudinaryAssets(assetRefs: CloudinaryAssetRef[]) {
  const uniqueRefs = new Map<string, Required<CloudinaryAssetRef>>();

  assetRefs.forEach((assetRef) => {
    const publicId = normalizePublicId(assetRef.publicId);
    if (!publicId) return;

    const resourceType = assetRef.resourceType ?? resourceTypeFromPublicId(publicId) ?? 'image';
    uniqueRefs.set(`${resourceType}:${publicId}`, { publicId, resourceType });
  });

  if (uniqueRefs.size === 0) return;

  const { deleteAsset } = await import('@/lib/cloudinary');

  await Promise.all(
    Array.from(uniqueRefs.values()).map((assetRef) =>
      deleteAsset(assetRef.publicId, assetRef.resourceType)
    )
  );
}
