import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
  redisDel: vi.fn(),
  redisIncr: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/redis', () => ({
  default: {
    get: mocks.redisGet,
    setex: mocks.redisSetex,
    del: mocks.redisDel,
    incr: mocks.redisIncr,
  },
}));

const createRequest = (url = 'http://localhost/api/suppliers') => new NextRequest(url);

describe('/api/suppliers', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.redisDel.mockReset();
    mocks.redisIncr.mockReset();
  });

  it('rejects unauthenticated reads', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/suppliers/route');
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('keeps unpaginated supplier calls backward compatible', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');

    const supplierSort = vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([{
        _id: { toString: () => 'supplier-1' },
        name: 'Metro Supply',
        openingBalance: 500,
        balanceType: 'credit',
      }]),
    }));

    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'userSummaries') {
          return { findOne: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
        }
        if (name === 'suppliers') {
          return { find: vi.fn(() => ({ sort: supplierSort })) };
        }
        if (name === 'entityBalances') {
          return {
            find: vi.fn(() => ({
              toArray: vi.fn().mockResolvedValue([
                { entityId: 'supplier-1', totalBalance: -750 },
              ]),
            })),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const { GET } = await import('@/app/api/suppliers/route');
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(payload).toEqual({
      suppliers: [{
        id: 'supplier-1',
        name: 'Metro Supply',
        openingBalance: 500,
        balanceType: 'credit',
        totalBalance: -750,
      }],
    });
    expect(payload).not.toHaveProperty('pagination');
    expect(supplierSort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  it('paginates suppliers and returns whole-directory balance totals', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');

    const supplierToArray = vi.fn().mockResolvedValue([{
      _id: { toString: () => 'supplier-21' },
      name: 'Page Two Supplier',
      openingBalance: 0,
      balanceType: 'debit',
    }]);
    const supplierLimit = vi.fn(() => ({ toArray: supplierToArray }));
    const supplierSkip = vi.fn(() => ({ limit: supplierLimit }));
    const supplierSort = vi.fn(() => ({ skip: supplierSkip }));

    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'userSummaries') {
          return { findOne: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
        }
        if (name === 'suppliers') {
          return {
            find: vi.fn(() => ({ sort: supplierSort })),
            countDocuments: vi.fn().mockResolvedValue(24),
          };
        }
        if (name === 'entityBalances') {
          return {
            aggregate: vi.fn(() => ({
              toArray: vi.fn().mockResolvedValue([{ receivable: 1200, payable: 6400 }]),
            })),
            find: vi.fn(() => ({
              toArray: vi.fn().mockResolvedValue([
                { entityId: 'supplier-21', totalBalance: -300 },
              ]),
            })),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const { GET } = await import('@/app/api/suppliers/route');
    const response = await GET(createRequest('http://localhost/api/suppliers?page=2&limit=20'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      suppliers: [{ id: 'supplier-21', name: 'Page Two Supplier', totalBalance: -300 }],
      pagination: { total: 24, page: 2, pageSize: 20, totalPages: 2 },
      summary: { total: 24, receivable: 1200, payable: 6400 },
    });
    expect(supplierSkip).toHaveBeenCalledWith(20);
    expect(supplierLimit).toHaveBeenCalledWith(20);
    expect(mocks.redisSetex).toHaveBeenCalledWith(
      'suppliers:user-1:v0:directory::page:2:limit:20',
      600,
      expect.any(String)
    );
  });
});
