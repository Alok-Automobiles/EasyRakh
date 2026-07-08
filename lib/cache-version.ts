import redis from './redis';

export type CacheNamespace =
  | 'bootstrap'
  | 'collectionTypes'
  | 'customers'
  | 'customEntities'
  | 'dashboard'
  | 'dailyCash'
  | 'inventory'
  | 'invoices'
  | 'search'
  | 'suppliers';

export const cacheVersionKey = (namespace: CacheNamespace, userId: string) =>
  `cache:v:${namespace}:${userId}`;

async function redisGetWithTimeout(key: string, timeoutMs: number) {
  if (typeof redis.get !== 'function') return null;

  try {
    return await Promise.race<string | null>([
      redis.get(key),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch (error) {
    console.warn(`Cache read failed for ${key}`, error);
    return null;
  }
}

export async function getCacheVersion(namespace: CacheNamespace, userId: string) {
  const value = await redisGetWithTimeout(cacheVersionKey(namespace, userId), 100);
  return value && /^\d+$/.test(value) ? value : '0';
}

export async function versionedCacheKey(
  namespace: CacheNamespace,
  userId: string,
  suffix = ''
) {
  const version = await getCacheVersion(namespace, userId);
  const normalizedSuffix = suffix ? `:${suffix}` : '';
  return `${namespace}:${userId}:v${version}${normalizedSuffix}`;
}

export async function bumpCacheVersion(namespace: CacheNamespace, userId: string) {
  if (typeof redis.incr !== 'function') return;

  try {
    await redis.incr(cacheVersionKey(namespace, userId));
  } catch (error) {
    console.warn(`Cache version bump failed for ${namespace}:${userId}`, error);
  }
}

export async function bumpCacheVersions(userId: string, namespaces: CacheNamespace[]) {
  const uniqueNamespaces = Array.from(new Set(namespaces));
  await Promise.all(uniqueNamespaces.map((namespace) => bumpCacheVersion(namespace, userId)));
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const cached = await redisGetWithTimeout(key, 250);
  if (!cached) return null;

  try {
    return JSON.parse(cached) as T;
  } catch (error) {
    console.warn(`Cache parse failed for ${key}`, error);
    redis.del(key).catch((err) => console.warn(`Stale cache delete failed for ${key}`, err));
    return null;
  }
}

export function setCachedJson(key: string, ttlSeconds: number, value: unknown) {
  return redis
    .setex(key, ttlSeconds, JSON.stringify(value))
    .catch((error) => console.warn(`Cache write failed for ${key}`, error));
}
