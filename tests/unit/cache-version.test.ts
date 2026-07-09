import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  default: mocks,
}));

describe('versioned cache safety', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.get.mockReset();
    mocks.setex.mockReset();
    mocks.del.mockReset();
    mocks.incr.mockReset();
  });

  it('uses version zero only for an authoritative Redis miss', async () => {
    mocks.get.mockResolvedValue(null);
    const { versionedCacheKey } = await import('@/lib/cache-version');

    await expect(versionedCacheKey('customers', 'user-1')).resolves.toBe(
      'customers:user-1:v0'
    );
  });

  it('uses the authoritative Redis version', async () => {
    mocks.get.mockResolvedValue('17');
    const { versionedCacheKey } = await import('@/lib/cache-version');

    await expect(versionedCacheKey('customers', 'user-1')).resolves.toBe(
      'customers:user-1:v17'
    );
  });

  it('bypasses cache reads and writes when the version lookup times out', async () => {
    vi.useFakeTimers();
    mocks.get.mockImplementation(() => new Promise(() => {}));
    const { getCachedJson, setCachedJson, versionedCacheKey } = await import(
      '@/lib/cache-version'
    );

    const cacheKeyPromise = versionedCacheKey('customers', 'user-1');
    await vi.advanceTimersByTimeAsync(500);
    const cacheKey = await cacheKeyPromise;

    expect(cacheKey).toBeNull();
    await expect(getCachedJson(cacheKey)).resolves.toBeNull();
    await expect(setCachedJson(cacheKey, 600, { customers: [] })).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.setex).not.toHaveBeenCalled();
  });

  it('bypasses the cache when Redis returns an invalid generation', async () => {
    mocks.get.mockResolvedValue('not-a-version');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { versionedCacheKey } = await import('@/lib/cache-version');

    await expect(versionedCacheKey('customers', 'user-1')).resolves.toBeNull();
    warning.mockRestore();
  });

  it('bypasses the cache when the version read fails', async () => {
    mocks.get.mockRejectedValue(new Error('Redis unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { versionedCacheKey } = await import('@/lib/cache-version');

    await expect(versionedCacheKey('customers', 'user-1')).resolves.toBeNull();
    warning.mockRestore();
  });

  it('bypasses Redis during the post-write consistency window', async () => {
    mocks.get.mockResolvedValue('12');
    const { requestCacheKey } = await import('@/lib/cache-version');
    const request = {
      cookies: {
        get: vi.fn().mockReturnValue({ value: '1' }),
      },
    };

    await expect(requestCacheKey(request, 'customers', 'user-1')).resolves.toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
