import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  cacheGet: vi.fn(),
  redisSetex: vi.fn(),
  redisDel: vi.fn(),
  inventoryListKey: vi.fn(),
  inventorySummaryKey: vi.fn(),
  invalidateInventoryCache: vi.fn(),
  cleanSearchQuery: vi.fn(),
  scoreInventoryItem: vi.fn(),
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
  INVENTORY_LIST_TTL_SECONDS: 30,
  INVENTORY_SUMMARY_TTL_SECONDS: 60,
  inventoryListKey: mocks.inventoryListKey,
  inventorySummaryKey: mocks.inventorySummaryKey,
  invalidateInventoryCache: mocks.invalidateInventoryCache,
}));

vi.mock('@/lib/voice-assistant', () => ({
  cleanSearchQuery: mocks.cleanSearchQuery,
  scoreInventoryItem: mocks.scoreInventoryItem,
}));

const validInventoryBody = {
  itemName: 'brake pad',
  itemNumber: 'bp-104',
  uniqueCode: 'rack-a-12',
  quantity: 8,
  location: 'front shelf',
  unitOfMeasure: 'pcs',
  partImages: ['https://res.cloudinary.com/demo/image/upload/part.jpg'],
  brand: 'bosch',
  description: 'front wheel set',
  buyingPrice: 450,
  mrp: 650,
  supplier: 'metro supplies',
  billingDate: '2026-06-20',
  billImages: ['https://res.cloudinary.com/demo/image/upload/bill.jpg'],
};

describe('/api/inventory', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.cacheGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.redisDel.mockReset();
    mocks.inventoryListKey.mockReset();
    mocks.inventorySummaryKey.mockReset();
    mocks.invalidateInventoryCache.mockReset();
    mocks.cleanSearchQuery.mockReset();
    mocks.scoreInventoryItem.mockReset();

    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.cacheGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');
    mocks.redisDel.mockResolvedValue(1);
    mocks.inventoryListKey.mockReturnValue('inventory:list:key');
    mocks.inventorySummaryKey.mockReturnValue('inventory:summary:key');
    mocks.invalidateInventoryCache.mockResolvedValue(undefined);
    mocks.cleanSearchQuery.mockReturnValue([]);
  });

  it('serves cached list and summary payloads without querying MongoDB', async () => {
    const listPayload = {
      items: [{ id: ids.inventory, itemName: 'BRAKE PAD', quantity: 8 }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    };
    const summaryPayload = {
      stats: {
        totalItems: 1,
        totalQuantity: 8,
        totalValue: 3600,
        outOfStockItems: 0,
        inactiveItems: 0,
        restockItems: 0,
        lowStockThreshold: 5,
        locations: ['FRONT SHELF'],
        brands: ['BOSCH'],
      },
      lowStockItems: [],
    };
    mocks.cacheGet
      .mockResolvedValueOnce(JSON.stringify(listPayload))
      .mockResolvedValueOnce(JSON.stringify(summaryPayload));

    const { GET } = await import('@/app/api/inventory/route');
    const response = await GET(jsonRequest('http://localhost/api/inventory?search=brake&page=0&limit=500'));

    expect(response.status).toBe(200);
    expect(mocks.inventoryListKey).toHaveBeenCalledWith(ids.user, {
      page: 1,
      limit: 100,
      status: 'all',
      search: 'brake',
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      items: listPayload.items,
      stats: summaryPayload.stats,
      lowStockItems: [],
      pagination: listPayload.pagination,
    });
  });

  it('returns a duplicate item-number conflict with the existing item details', async () => {
    const findOne = vi.fn().mockResolvedValue({
      _id: objectIdLike(ids.otherInventory),
      itemName: 'BRAKE PAD OLD',
      itemNumber: 'BP-104',
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });

    const { POST } = await import('@/app/api/inventory/route');
    const response = await POST(jsonRequest('http://localhost/api/inventory', validInventoryBody));

    expect(response.status).toBe(409);
    expect(findOne).toHaveBeenCalledWith(
      {
        userId: ids.user,
        itemNumber: { $regex: '^BP-104$', $options: 'i' },
      },
      { projection: { _id: 1, itemName: 1, itemNumber: 1 } }
    );
    await expect(response.json()).resolves.toEqual({
      error: 'Item number "BP-104" already exists for "BRAKE PAD OLD". Use a different item number.',
      code: 'DUPLICATE_ITEM_NUMBER',
      existingItem: {
        id: ids.otherInventory,
        itemName: 'BRAKE PAD OLD',
        itemNumber: 'BP-104',
      },
    });
    expect(mocks.invalidateInventoryCache).not.toHaveBeenCalled();
  });

  it('normalizes persisted text fields to uppercase and invalidates inventory caches on create', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const insertOne = vi.fn().mockResolvedValue({ insertedId: objectIdLike(ids.inventory) });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, insertOne })),
    });

    const { POST } = await import('@/app/api/inventory/route');
    const response = await POST(jsonRequest('http://localhost/api/inventory', validInventoryBody));

    expect(response.status).toBe(201);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ids.user,
        itemName: 'BRAKE PAD',
        itemNumber: 'BP-104',
        uniqueCode: 'RACK-A-12',
        location: 'FRONT SHELF',
        unitOfMeasure: 'pcs',
        brand: 'BOSCH',
        description: 'FRONT WHEEL SET',
        supplier: 'METRO SUPPLIES',
        quantity: 8,
        lastQuantityUpdatedAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.invalidateInventoryCache).toHaveBeenCalledWith(ids.user);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Inventory item created successfully',
      item: {
        id: ids.inventory,
        itemName: 'BRAKE PAD',
        itemNumber: 'BP-104',
        supplier: 'METRO SUPPLIES',
      },
    });
  });
});
