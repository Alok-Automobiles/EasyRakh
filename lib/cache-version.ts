import redis from './redis';
import { hasRecentWriteBarrier } from './cache-consistency';

const CACHE_VERSION_TIMEOUT_MS = 500;
const CACHE_VALUE_TIMEOUT_MS = 250;

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

type RedisReadResult =
  | { status: 'available'; value: string | null }
  | { status: 'unavailable' };

async function redisGetWithTimeout(
  key: string,
  timeoutMs: number
): Promise<RedisReadResult> {
  if (typeof redis.get !== 'function') return { status: 'unavailable' };

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<RedisReadResult>([
      redis.get(key).then((value) => ({ status: 'available', value })),
      new Promise<RedisReadResult>((resolve) => {
        timeout = setTimeout(() => resolve({ status: 'unavailable' }), timeoutMs);
      }),
    ]);
  } catch (error) {
    console.warn(`Cache read failed for ${key}`, error);
    return { status: 'unavailable' };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Returns null when Redis cannot authoritatively provide a cache generation.
 * Callers must bypass the cache in that case. Falling back to generation "0"
 * on a timeout can resurrect an old payload after a successful write.
 */
export async function getCacheVersion(
  namespace: CacheNamespace,
  userId: string
): Promise<string | null> {
  const result = await redisGetWithTimeout(
    cacheVersionKey(namespace, userId),
    CACHE_VERSION_TIMEOUT_MS
  );

  if (result.status === 'unavailable') return null;
  if (result.value === null) return '0';

  if (!/^\d+$/.test(result.value)) {
    console.warn(`Invalid cache version for ${namespace}:${userId}; bypassing cache`);
    return null;
  }

  return result.value;
}

export async function versionedCacheKey(
  namespace: CacheNamespace,
  userId: string,
  suffix = ''
): Promise<string | null> {
  const version = await getCacheVersion(namespace, userId);
  if (version === null) return null;

  const normalizedSuffix = suffix ? `:${suffix}` : '';
  return `${namespace}:${userId}:v${version}${normalizedSuffix}`;
}

export async function requestCacheKey(
  request: Parameters<typeof hasRecentWriteBarrier>[0],
  namespace: CacheNamespace,
  userId: string,
  suffix = ''
): Promise<string | null> {
  if (hasRecentWriteBarrier(request)) return null;
  return versionedCacheKey(namespace, userId, suffix);
}

export async function getRequestCacheVersion(
  request: Parameters<typeof hasRecentWriteBarrier>[0],
  namespace: CacheNamespace,
  userId: string
): Promise<string | null> {
  if (hasRecentWriteBarrier(request)) return null;
  return getCacheVersion(namespace, userId);
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

export async function getCachedJson<T>(key: string | null): Promise<T | null> {
  if (key === null) return null;

  const result = await redisGetWithTimeout(key, CACHE_VALUE_TIMEOUT_MS);
  if (result.status === 'unavailable' || !result.value) return null;

  try {
    return JSON.parse(result.value) as T;
  } catch (error) {
    console.warn(`Cache parse failed for ${key}`, error);
    redis.del(key).catch((err) => console.warn(`Stale cache delete failed for ${key}`, err));
    return null;
  }
}

export function setCachedJson(key: string | null, ttlSeconds: number, value: unknown) {
  if (key === null) return Promise.resolve();

  return redis
    .setex(key, ttlSeconds, JSON.stringify(value))
    .catch((error) => console.warn(`Cache write failed for ${key}`, error));
}
