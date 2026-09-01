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

const createRequest = (url = 'http://localhost/api/customers', body?: unknown) =>
  new NextRequest(url, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  });

describe('/api/customers', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.redisDel.mockReset();
    mocks.redisIncr.mockReset();
    mocks.redisIncr.mockResolvedValue(1);
  });

  it('rejects unauthenticated reads', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/customers/route');
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('serves cached customers without hitting MongoDB', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.redisGet
      .mockResolvedValueOnce('4')
      .mockResolvedValueOnce(
      JSON.stringify({
        customers: [{ id: 'customer-1', name: 'Raj Traders', totalBalance: 2500 }],
      })
      );

    const { GET } = await import('@/app/api/customers/route');
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      customers: [{ id: 'customer-1', name: 'Raj Traders', totalBalance: 2500 }],
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('paginates customers and returns whole-directory balance totals', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');

    const pageCustomers = [{
      _id: { toString: () => 'customer-21' },
      name: 'Page Two Customer',
      openingBalance: 1000,
      balanceType: 'debit',
      createdAt: new Date('2026-07-09T00:00:00.000Z'),
    }];
    const customerToArray = vi.fn().mockResolvedValue(pageCustomers);
    const customerLimit = vi.fn(() => ({ toArray: customerToArray }));
    const customerSkip = vi.fn(() => ({ limit: customerLimit }));
    const customerSort = vi.fn(() => ({ skip: customerSkip }));
    const customerFind = vi.fn(() => ({ sort: customerSort }));
    const customerCount = vi.fn().mockResolvedValue(45);

    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'userSummaries') {
          return { findOne: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
        }
        if (name === 'customers') {
          return { find: customerFind, countDocuments: customerCount };
        }
        if (name === 'entityBalances') {
          return {
            aggregate: vi.fn(() => ({
              toArray: vi.fn().mockResolvedValue([{ receivable: 9000, payable: 2500 }]),
            })),
            find: vi.fn(() => ({
              toArray: vi.fn().mockResolvedValue([
                { entityId: 'customer-21', totalBalance: 1750 },
              ]),
            })),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const { GET } = await import('@/app/api/customers/route');
    const response = await GET(createRequest('http://localhost/api/customers?page=2&limit=20'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      customers: [{ id: 'customer-21', name: 'Page Two Customer', totalBalance: 1750 }],
      pagination: { total: 45, page: 2, pageSize: 20, totalPages: 3 },
      summary: { total: 45, receivable: 9000, payable: 2500 },
    });
    expect(customerSort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(customerSkip).toHaveBeenCalledWith(20);
    expect(customerLimit).toHaveBeenCalledWith(20);
    expect(mocks.redisSetex).toHaveBeenCalledWith(
      'customers:user-1:v0:directory::page:2:limit:20',
      600,
      expect.any(String)
    );
  });

  it('paginates one-character searches and clamps invalid page parameters', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');

    const customerLimit = vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([{
        _id: { toString: () => 'customer-r' },
        name: 'R Traders',
        openingBalance: 0,
        balanceType: 'debit',
      }]),
    }));
    const customerSkip = vi.fn(() => ({ limit: customerLimit }));
    const customerSort = vi.fn(() => ({ skip: customerSkip }));
    const customerFind = vi.fn(() => ({ sort: customerSort }));
    const customerCount = vi.fn((filter: Record<string, unknown>) =>
      Promise.resolve('$or' in filter ? 2 : 250)
    );

    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'userSummaries') {
          return { findOne: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
        }
        if (name === 'customers') {
          return { find: customerFind, countDocuments: customerCount };
        }
        if (name === 'entityBalances') {
          return {
            aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
            find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const { GET } = await import('@/app/api/customers/route');
    const response = await GET(
      createRequest('http://localhost/api/customers?search=R&page=invalid&limit=500')
    );
    const payload = await response.json();

    expect(payload.pagination).toEqual({ total: 2, page: 1, pageSize: 100, totalPages: 1 });
    expect(payload.summary).toEqual({ total: 250, receivable: 0, payable: 0 });
    expect(customerFind).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      $or: expect.any(Array),
    }));
    expect(customerSkip).toHaveBeenCalledWith(0);
    expect(customerLimit).toHaveBeenCalledWith(100);
  });

  it('reads MongoDB instead of stale Redis during the post-write barrier', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        customers: [{ id: 'customer-1', name: 'Stale Name', totalBalance: 2500 }],
      })
    );

    const customerCursor = {
      sort: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: { toString: () => 'customer-1' },
            name: 'Fresh Name',
            openingBalance: 2500,
            balanceType: 'debit',
            createdAt: new Date('2026-07-09T00:00:00.000Z'),
          },
        ]),
      })),
    };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'userSummaries') {
          return { findOne: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
        }
        if (name === 'customers') {
          return { find: vi.fn(() => customerCursor) };
        }
        if (name === 'entityBalances') {
          return {
            find: vi.fn(() => ({
              toArray: vi.fn().mockResolvedValue([
                { entityId: 'customer-1', totalBalance: 2500 },
              ]),
            })),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const { GET } = await import('@/app/api/customers/route');
    const response = await GET(
      new NextRequest('http://localhost/api/customers', {
        headers: { cookie: 'easyrakh_cache_write=1' },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      customers: [{ id: 'customer-1', name: 'Fresh Name', totalBalance: 2500 }],
    });
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.redisSetex).not.toHaveBeenCalled();
  });

  it('validates customer creation input', async () => {
    mocks.getUserIdFromRequest.mockReturnValue('user-1');

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST(
      createRequest('http://localhost/api/customers', {
        name: '',
        email: 'bad-email',
        openingBalance: 0,
        balanceType: 'debit',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Name is required' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('creates customers and invalidates user-scoped caches', async () => {
    const insertOne = vi.fn().mockResolvedValue({
      insertedId: { toString: () => 'customer-1' },
    });
    mocks.getUserIdFromRequest.mockReturnValue('user-1');
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({
        insertOne,
      })),
    });
    mocks.redisDel.mockResolvedValue(2);

    const { POST } = await import('@/app/api/customers/route');
    const response = await POST(
      createRequest('http://localhost/api/customers', {
        name: 'Raj Traders',
        phone: '9876543210',
        email: '',
        address: 'Main market',
        openingBalance: 1000,
        balanceType: 'debit',
      })
    );

    expect(response.status).toBe(201);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        name: 'Raj Traders',
        phone: '9876543210',
        openingBalance: 1000,
        balanceType: 'debit',
      })
    );
    expect(mocks.redisIncr).toHaveBeenCalledWith('cache:v:customers:user-1');
    expect(mocks.redisIncr).toHaveBeenCalledWith('cache:v:dashboard:user-1');
    expect(mocks.redisIncr).toHaveBeenCalledWith('cache:v:bootstrap:user-1');
    await expect(response.json()).resolves.toMatchObject({
      message: 'Customer created successfully',
      customer: {
        id: 'customer-1',
        name: 'Raj Traders',
      },
    });
  });
});
