import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

function findChain(items: unknown[]) {
  const toArray = vi.fn().mockResolvedValue(items);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  const find = vi.fn(() => ({ sort }));
  return { find, sort, limit, toArray };
}

describe('/api/inventory/suggestions', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
  });

  it('requires authentication', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/inventory/suggestions/route');
    const response = await GET(jsonRequest('http://localhost/api/inventory/suggestions?itemNumber=BP'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('returns an empty list for a blank search without querying MongoDB', async () => {
    const { GET } = await import('@/app/api/inventory/suggestions/route');
    const response = await GET(jsonRequest('http://localhost/api/inventory/suggestions?itemNumber='));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('searches user-scoped inventory details and returns the invoice suggestion shape', async () => {
    const chain = findChain([
      {
        _id: objectIdLike(ids.inventory),
        itemNumber: 'BP-104',
        itemName: 'BRAKE PAD',
        quantity: 8,
        unitOfMeasure: 'PCS',
        buyingPrice: 450,
        uniqueCode: 'UC-104',
        brand: 'BOSCH',
        location: 'RACK A',
      },
    ]);
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ find: chain.find })),
    });

    const { GET } = await import('@/app/api/inventory/suggestions/route');
    const response = await GET(jsonRequest('http://localhost/api/inventory/suggestions?itemNumber=BP&limit=50'));

    expect(response.status).toBe(200);
    expect(chain.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ids.user,
        $or: expect.arrayContaining([
          { itemNumberKey: { $regex: '^BP' } },
          { itemName: { $regex: '^BP' } },
          { searchTokens: { $all: ['bp'] } },
        ]),
      }),
      {
        projection: {
          _id: 1,
          itemNumber: 1,
          itemName: 1,
          quantity: 1,
          unitOfMeasure: 1,
          buyingPrice: 1,
          uniqueCode: 1,
          brand: 1,
          location: 1,
          updatedAt: 1,
        },
      }
    );
    expect(chain.limit).toHaveBeenCalledWith(100);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: ids.inventory,
          itemNumber: 'BP-104',
          itemName: 'BRAKE PAD',
          quantity: 8,
          unitOfMeasure: 'PCS',
          buyingPrice: 450,
          uniqueCode: 'UC-104',
          brand: 'BOSCH',
          location: 'RACK A',
        },
      ],
    });
  });

  it('finds an inventory item by name when its part number is empty', async () => {
    const chain = findChain([
      {
        _id: objectIdLike(ids.inventory),
        itemNumber: '',
        itemName: 'BRAKE SHOE',
        quantity: 6,
        unitOfMeasure: 'PCS',
        buyingPrice: 300,
        uniqueCode: 'SHOE-01',
        brand: 'BOSCH',
        location: 'RACK B',
      },
    ]);
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ find: chain.find })),
    });

    const { GET } = await import('@/app/api/inventory/suggestions/route');
    const response = await GET(
      jsonRequest('http://localhost/api/inventory/suggestions?query=brake%20shoe')
    );

    expect(response.status).toBe(200);
    expect(chain.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ids.user,
        $or: expect.arrayContaining([
          { itemName: { $regex: '^BRAKE SHOE' } },
          { searchTokens: { $all: ['brake', 'shoe'] } },
        ]),
      }),
      expect.any(Object)
    );
    await expect(response.json()).resolves.toEqual({
      items: [{
        id: ids.inventory,
        itemNumber: '',
        itemName: 'BRAKE SHOE',
        quantity: 6,
        unitOfMeasure: 'PCS',
        buyingPrice: 300,
        uniqueCode: 'SHOE-01',
        brand: 'BOSCH',
        location: 'RACK B',
      }],
    });
  });
});
