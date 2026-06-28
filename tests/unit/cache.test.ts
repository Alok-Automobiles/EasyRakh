import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redisDel: vi.fn(),
  deleteByPattern: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  default: {
    del: mocks.redisDel,
  },
  deleteByPattern: mocks.deleteByPattern,
}));

describe('inventory cache helpers', () => {
  beforeEach(() => {
    mocks.redisDel.mockReset();
    mocks.deleteByPattern.mockReset();
    mocks.redisDel.mockResolvedValue(1);
    mocks.deleteByPattern.mockResolvedValue(3);
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
    ).toBe('inventory:list:user-1:p2:l50:slow-stock:qbrake%20pad%20%2F%20front');
    expect(inventorySummaryKey('user-1')).toBe('inventory:summary:user-1');
    expect(inventoryItemKey('user-1', 'item-1')).toBe('inventory:item:user-1:item-1');
  });

  it('invalidates list, summary, item, and all dashboard stats variants', async () => {
    const { invalidateInventoryCache } = await import('@/lib/cache');

    await invalidateInventoryCache('user-1', 'item-1');

    expect(mocks.deleteByPattern).toHaveBeenCalledWith('inventory:list:user-1:*');
    expect(mocks.deleteByPattern).toHaveBeenCalledWith('dashboard:stats:user-1*');
    expect(mocks.redisDel).toHaveBeenCalledWith('inventory:summary:user-1');
    expect(mocks.redisDel).toHaveBeenCalledWith('inventory:item:user-1:item-1');
  });

  it('does not reject when one cache backend operation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.deleteByPattern.mockRejectedValueOnce(new Error('scan failed'));
    const { invalidateInventoryCache } = await import('@/lib/cache');

    await expect(invalidateInventoryCache('user-1')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      'Inventory cache invalidation failed:',
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
