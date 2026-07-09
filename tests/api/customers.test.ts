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
