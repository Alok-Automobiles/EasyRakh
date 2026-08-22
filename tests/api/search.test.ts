import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitConfigs: {
    read: { windowMs: 60_000, maxRequests: 100 },
  },
}));

vi.mock('@/lib/redis', () => ({
  default: {
    get: mocks.redisGet,
    setex: mocks.redisSetex,
  },
}));

function findChain(items: unknown[]) {
  const chain = {
    project: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    toArray: vi.fn().mockResolvedValue(items),
  };
  return {
    find: vi.fn(() => chain),
    chain,
  };
}

describe('/api/search', () => {
  beforeEach(() => {
    delete process.env.MONGODB_SEARCH_ENABLED;
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');
  });

  it('returns early for short queries after auth without touching cache or MongoDB', async () => {
    const { GET } = await import('@/app/api/search/route');
    const response = await GET(jsonRequest('http://localhost/api/search?q=r'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [] });
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before auth and database work', async () => {
    const limited = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    mocks.checkRateLimit.mockResolvedValue(limited);

    const { GET } = await import('@/app/api/search/route');
    const response = await GET(jsonRequest('http://localhost/api/search?q=raj'));

    expect(response.status).toBe(429);
    expect(mocks.getUserIdFromRequest).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('serves cached search results without hitting MongoDB', async () => {
    const cached = {
      results: [{ id: ids.customer, name: 'Raj Traders', type: 'customer', href: `/ledger/customer/${ids.customer}` }],
    };
    mocks.redisGet
      .mockResolvedValueOnce('0')
      .mockResolvedValueOnce(JSON.stringify(cached));

    const { GET } = await import('@/app/api/search/route');
    const response = await GET(jsonRequest('http://localhost/api/search?q=RAJ'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(cached);
    expect(mocks.redisGet).toHaveBeenCalledWith(`cache:v:search:${ids.user}`);
    expect(mocks.redisGet).toHaveBeenCalledWith(`search:${ids.user}:v0:raj`);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('formats customers, suppliers, custom entities, and invoices into navigable results', async () => {
    const customers = findChain([
      { _id: objectIdLike(ids.customer), name: 'Raj Traders', phone: '9876543210' },
    ]);
    const suppliers = findChain([
      { _id: objectIdLike(ids.supplier), name: 'Raj Supply', email: 'supplier@example.com' },
    ]);
    const customEntities = findChain([
      { _id: objectIdLike(ids.customEntity), name: 'Raj Transport', phone: '9999999999', collectionType: 'transporters' },
    ]);
    const invoices = findChain([
      { _id: objectIdLike('507f1f77bcf86cd799439099'), invoiceNumber: 'INV-001', customerName: 'Raj Traders', totalAmount: 4500, status: 'partial' },
    ]);
    const inventory = findChain([]);
    const collections: Record<string, ReturnType<typeof findChain>> = {
      customers,
      suppliers,
      customEntities,
      invoices,
      inventory,
    };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => collections[name]),
    });

    const { GET } = await import('@/app/api/search/route');
    const response = await GET(jsonRequest('http://localhost/api/search?q=raj'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toEqual([
      expect.objectContaining({
        id: ids.customer,
        name: 'Raj Traders',
        type: 'customer',
        subtitle: '9876543210',
        badge: 'Customer',
        href: `/ledger/customer/${ids.customer}`,
      }),
      expect.objectContaining({
        id: ids.supplier,
        type: 'supplier',
        subtitle: 'supplier@example.com',
        href: `/ledger/supplier/${ids.supplier}`,
      }),
      expect.objectContaining({
        id: ids.customEntity,
        type: 'custom_entity',
        badge: 'transporters',
        href: `/ledger/transporters/${ids.customEntity}`,
      }),
      expect.objectContaining({
        name: 'INV-001',
        type: 'invoice',
        subtitle: 'Raj Traders — ₹4,500',
        badge: 'Partial',
        href: '/invoices/507f1f77bcf86cd799439099',
      }),
    ]);
    expect(mocks.redisSetex).toHaveBeenCalledWith(
      `search:${ids.user}:v0:raj`,
      60,
      JSON.stringify(body)
    );
    expect(customers.find).toHaveBeenCalledWith({
      userId: ids.user,
      $or: expect.arrayContaining([
        { searchTokens: { $all: ['raj'] } },
        { name: { $regex: 'raj', $options: 'i' } },
        { phone: { $regex: 'raj', $options: 'i' } },
      ]),
    });
    expect(inventory.chain.project).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueCode: 1,
        brand: 1,
        description: 1,
        supplier: 1,
      })
    );
  });
});
