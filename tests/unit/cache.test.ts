import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redisDel: vi.fn(),
  redisIncr: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  default: {
    del: mocks.redisDel,
    incr: mocks.redisIncr,
  },
}));

describe('inventory cache helpers', () => {
  beforeEach(() => {
    mocks.redisDel.mockReset();
    mocks.redisIncr.mockReset();
    mocks.redisDel.mockResolvedValue(1);
    mocks.redisIncr.mockResolvedValue(1);
  });

  it('builds stable cache keys with encoded search text', async () => {
    const { inventoryItemKey, inventoryListKey, inventorySummaryKey } = await import('@/lib/cache');

    expect(
      inventoryListKey('user-1', {
        page: 2,
        limit: 50,
        status: 'low-stock',
        search: 'brake pad / front',
      })
    ).toBe('inventory:list:user-1:v0:p2:l50:slow-stock:qbrake%20pad%20%2F%20front');
    expect(inventorySummaryKey('user-1')).toBe('inventory:summary:user-1:v0');
    expect(inventoryItemKey('user-1', 'item-1')).toBe('inventory:item:user-1:item-1');
  });

  it('invalidates broad inventory/dashboard/search caches with version bumps and exact item keys', async () => {
    const { invalidateInventoryCache } = await import('@/lib/cache');

    await invalidateInventoryCache('user-1', 'item-1');

    expect(mocks.redisIncr).toHaveBeenCalledWith('cache:v:inventory:user-1');
    expect(mocks.redisIncr).toHaveBeenCalledWith('cache:v:dashboard:user-1');
    expect(mocks.redisIncr).toHaveBeenCalledWith('cache:v:search:user-1');
    expect(mocks.redisDel).toHaveBeenCalledWith('inventory:item:user-1:item-1');
  });

  it('does not reject when one cache backend operation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.redisIncr.mockRejectedValueOnce(new Error('incr failed'));
    const { invalidateInventoryCache } = await import('@/lib/cache');

    await expect(invalidateInventoryCache('user-1')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'Cache version bump failed for inventory:user-1',
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
