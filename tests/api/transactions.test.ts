import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/redis', () => ({
  default: {
    del: mocks.redisDel,
  },
}));

function createCursor(items: unknown[]) {
  const cursor = {
    sort: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    toArray: vi.fn().mockResolvedValue(items),
  };
  return cursor;
}

describe('/api/transactions', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisDel.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.redisDel.mockResolvedValue(1);
  });

  it('builds a user-scoped filtered paginated read query and maps legacy entity ids', async () => {
    const cursor = createCursor([
      {
        _id: objectIdLike(ids.transaction),
        customerId: ids.customer,
        type: 'credit',
        amount: 1200,
        description: 'Payment',
        date: new Date('2026-06-20T00:00:00.000Z'),
        createdAt: new Date('2026-06-20T08:00:00.000Z'),
      },
    ]);
    const countDocuments = vi.fn().mockResolvedValue(225);
    const find = vi.fn(() => cursor);
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({
        countDocuments,
        find,
      })),
    });

    const { GET } = await import('@/app/api/transactions/route');
    const response = await GET(
      jsonRequest(
        `http://localhost/api/transactions?entityId=${ids.customer}&entityType=customer&type=credit&startDate=2026-06-01&endDate=2026-06-30&page=3&limit=200`
      )
    );

    expect(response.status).toBe(200);
    expect(countDocuments).toHaveBeenCalledWith({
      userId: ids.user,
      entityId: ids.customer,
      entityType: 'customer',
      type: 'credit',
      date: {
        $gte: new Date('2026-06-01'),
        $lte: new Date('2026-06-30'),
      },
    });
    expect(cursor.skip).toHaveBeenCalledWith(200);
    expect(cursor.limit).toHaveBeenCalledWith(100);
    await expect(response.json()).resolves.toMatchObject({
      transactions: [
        {
          id: ids.transaction,
          entityType: 'customer',
          entityId: ids.customer,
          customerId: ids.customer,
          type: 'credit',
          amount: 1200,
        },
      ],
      pagination: {
        total: 225,
        page: 3,
        pageSize: 100,
        totalPages: 3,
      },
    });
  });

  it('rejects bill uploads without a public id before touching the database', async () => {
    const { POST } = await import('@/app/api/transactions/route');
    const response = await POST(
      jsonRequest('http://localhost/api/transactions', {
        entityType: 'customer',
        entityId: ids.customer,
        type: 'credit',
        amount: 500,
        description: 'Advance',
        date: '2026-06-20',
        billUrl: 'https://res.cloudinary.com/demo/image/upload/bill.jpg',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'billPublicId is required when billUrl is provided',
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('creates supplier transactions only after verifying ownership and invalidates affected caches', async () => {
    const insertOne = vi.fn().mockResolvedValue({ insertedId: objectIdLike(ids.transaction) });
    const supplierFindOne = vi.fn().mockResolvedValue({ _id: objectIdLike(ids.supplier), userId: ids.user });
    const collection = vi.fn((name: string) => {
      if (name === 'transactions') return { insertOne };
      if (name === 'suppliers') return { findOne: supplierFindOne };
      return { findOne: vi.fn().mockResolvedValue(null) };
    });
    mocks.getDb.mockResolvedValue({ collection });

    const { POST } = await import('@/app/api/transactions/route');
    const response = await POST(
      jsonRequest('http://localhost/api/transactions', {
        entityType: 'supplier',
        entityId: ids.supplier,
        type: 'debit',
        amount: 2750,
        description: 'Parts purchase',
        date: '2026-06-21',
        billUrl: ' https://res.cloudinary.com/demo/image/upload/bill.jpg ',
        billPublicId: ' bills/supplier-1 ',
      })
    );

    expect(response.status).toBe(201);
    expect(supplierFindOne).toHaveBeenCalledWith({
      _id: expect.any(Object),
      userId: ids.user,
    });
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ids.user,
        entityType: 'supplier',
        entityId: ids.supplier,
        supplierId: ids.supplier,
        customerId: undefined,
        type: 'debit',
        amount: 2750,
        billUrl: 'https://res.cloudinary.com/demo/image/upload/bill.jpg',
        billPublicId: 'bills/supplier-1',
      })
    );
    expect(mocks.redisDel).toHaveBeenCalledWith(
      `dashboard:stats:${ids.user}`,
      `ledger:supplier:${ids.supplier}:${ids.user}`,
      `suppliers:${ids.user}`
    );
    await expect(response.json()).resolves.toMatchObject({
      message: 'Transaction created successfully',
      transaction: {
        id: ids.transaction,
        entityType: 'supplier',
        entityId: ids.supplier,
        type: 'debit',
        amount: 2750,
      },
    });
  });
});
