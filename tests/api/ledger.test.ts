import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
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
  },
}));

function transactionCursor(items: unknown[]) {
  const cursor = {
    sort: vi.fn(() => cursor),
    toArray: vi.fn().mockResolvedValue(items),
  };
  return {
    find: vi.fn(() => cursor),
    cursor,
  };
}

describe('/api/ledger/[entityType]/[entityId]', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');
  });

  it('returns cached ledgers without touching MongoDB', async () => {
    const cached = { entries: [], totals: { credit: 0, debit: 0, balance: 0 } };
    mocks.redisGet.mockResolvedValue(JSON.stringify(cached));

    const { GET } = await import('@/app/api/ledger/[entityType]/[entityId]/route');
    const response = await GET(
      jsonRequest('http://localhost/api/ledger/customer/customer-1'),
      routeParams({ entityType: 'customer', entityId: ids.customer })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(cached);
    expect(mocks.redisGet).toHaveBeenCalledWith(`ledger:customer:${ids.customer}:${ids.user}`);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('calculates running balances from credit opening balances and ordered transactions', async () => {
    const customer = {
      _id: objectIdLike(ids.customer),
      name: 'Raj Traders',
      openingBalance: 500,
      balanceType: 'credit',
    };
    const transactions = transactionCursor([
      {
        _id: objectIdLike('507f1f77bcf86cd799439031'),
        type: 'debit',
        amount: 200,
        description: 'Purchase return',
        date: new Date('2026-06-01T00:00:00.000Z'),
      },
      {
        _id: objectIdLike('507f1f77bcf86cd799439032'),
        type: 'credit',
        amount: 100,
        description: 'Payment received',
        date: new Date('2026-06-02T00:00:00.000Z'),
      },
    ]);
    const collection = vi.fn((name: string) => {
      if (name === 'customers') return { findOne: vi.fn().mockResolvedValue(customer) };
      if (name === 'transactions') return { find: transactions.find };
      return { findOne: vi.fn().mockResolvedValue(null) };
    });
    mocks.getDb.mockResolvedValue({ collection });

    const { GET } = await import('@/app/api/ledger/[entityType]/[entityId]/route');
    const response = await GET(
      jsonRequest('http://localhost/api/ledger/customer/customer-1'),
      routeParams({ entityType: 'customer', entityId: ids.customer })
    );

    expect(response.status).toBe(200);
    expect(transactions.find).toHaveBeenCalledWith({
      entityId: ids.customer,
      entityType: 'customer',
      userId: ids.user,
    });
    await expect(response.json()).resolves.toMatchObject({
      entity: {
        id: ids.customer,
        name: 'Raj Traders',
        openingBalance: 500,
        balanceType: 'credit',
      },
      entries: [
        { debit: 200, credit: 0, balance: -300 },
        { debit: 0, credit: 100, balance: -400 },
      ],
      totals: {
        credit: 100,
        debit: 200,
        balance: -400,
      },
    });
    expect(mocks.redisSetex).toHaveBeenCalledWith(
      `ledger:customer:${ids.customer}:${ids.user}`,
      180,
      expect.any(String)
    );
  });
});
