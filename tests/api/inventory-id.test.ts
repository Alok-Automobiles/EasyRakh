import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  cacheGet: vi.fn(),
  redisSetex: vi.fn(),
  redisDel: vi.fn(),
  inventoryItemKey: vi.fn(),
  invalidateInventoryCache: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/redis', () => ({
  default: {
    setex: mocks.redisSetex,
    del: mocks.redisDel,
  },
  cacheGet: mocks.cacheGet,
}));

vi.mock('@/lib/cache', () => ({
  INVENTORY_ITEM_TTL_SECONDS: 120,
  inventoryItemKey: mocks.inventoryItemKey,
  invalidateInventoryCache: mocks.invalidateInventoryCache,
}));

const storedItem = {
  _id: objectIdLike(ids.inventory),
  itemName: 'BRAKE PAD',
  itemNumber: 'BP-104',
  uniqueCode: 'RACK-A-12',
  quantity: 0,
  location: 'FRONT SHELF',
  unitOfMeasure: 'PCS',
  partImages: [],
  brand: 'BOSCH',
  description: 'FRONT WHEEL SET',
  buyingPrice: 450,
  mrp: 650,
  supplier: 'METRO SUPPLIES',
  billImages: [],
  lastQuantityUpdatedAt: new Date('2026-06-20T00:00:00.000Z'),
  createdAt: new Date('2026-06-18T00:00:00.000Z'),
  updatedAt: new Date('2026-06-20T00:00:00.000Z'),
};

describe('/api/inventory/[id]', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.cacheGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.redisDel.mockReset();
    mocks.inventoryItemKey.mockReset();
    mocks.invalidateInventoryCache.mockReset();

    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.cacheGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');
    mocks.redisDel.mockResolvedValue(1);
    mocks.inventoryItemKey.mockReturnValue('inventory:item:key');
    mocks.invalidateInventoryCache.mockResolvedValue(undefined);
  });

  it('rejects invalid ids before cache or database work', async () => {
    const { GET } = await import('@/app/api/inventory/[id]/route');
    const response = await GET(
      jsonRequest('http://localhost/api/inventory/not-valid'),
      routeParams({ id: 'not-valid' })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid inventory item id' });
    expect(mocks.cacheGet).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('deletes corrupt item cache entries and falls back to MongoDB', async () => {
    const findOne = vi.fn().mockResolvedValue(storedItem);
    mocks.cacheGet.mockResolvedValue('{not json');
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('@/app/api/inventory/[id]/route');
    const response = await GET(
      jsonRequest('http://localhost/api/inventory/item'),
      routeParams({ id: ids.inventory })
    );

    expect(response.status).toBe(200);
    expect(mocks.redisDel).toHaveBeenCalledWith('inventory:item:key');
    expect(findOne).toHaveBeenCalledWith({ _id: expect.any(Object), userId: ids.user });
    expect(mocks.redisSetex).toHaveBeenCalledWith(
      'inventory:item:key',
      120,
      expect.stringContaining('"itemName":"BRAKE PAD"')
    );
    await expect(response.json()).resolves.toMatchObject({
      item: {
        id: ids.inventory,
        itemName: 'BRAKE PAD',
        quantity: 0,
      },
    });
    warn.mockRestore();
  });

  it('rejects ambiguous quantity patches before hitting MongoDB', async () => {
    const { PATCH } = await import('@/app/api/inventory/[id]/route');
    const response = await PATCH(
      jsonRequest('http://localhost/api/inventory/item', { delta: 1, quantity: 3 }, { method: 'PATCH' }),
      routeParams({ id: ids.inventory })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Provide either delta or quantity, not both',
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('uses an atomic decrement guard and returns the unchanged item at zero quantity', async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue(null);
    const findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: objectIdLike(ids.inventory), quantity: 0 })
      .mockResolvedValueOnce(storedItem);
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOneAndUpdate, findOne })),
    });

    const { PATCH } = await import('@/app/api/inventory/[id]/route');
    const response = await PATCH(
      jsonRequest('http://localhost/api/inventory/item', { delta: -1 }, { method: 'PATCH' }),
      routeParams({ id: ids.inventory })
    );

    expect(response.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user, quantity: { $gte: 1 } },
      {
        $inc: { quantity: -1 },
        $set: {
          lastQuantityUpdatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      },
      { returnDocument: 'after' }
    );
    expect(mocks.invalidateInventoryCache).toHaveBeenCalledWith(ids.user, ids.inventory);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Quantity already at minimum',
      item: {
        id: ids.inventory,
        quantity: 0,
      },
    });
  });
});
