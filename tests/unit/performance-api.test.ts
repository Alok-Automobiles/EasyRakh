import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserIdFromRequest: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  getDb: vi.fn(),
  createIndex: vi.fn(),
  bulkWrite: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getUserIdFromRequest: mocks.getUserIdFromRequest }));
vi.mock('@/lib/redis', () => ({ default: { incr: mocks.incr, expire: mocks.expire } }));
vi.mock('@/lib/mongodb', () => ({ getDb: mocks.getDb }));

import { POST } from '@/app/api/performance/route';

function request(events: unknown) {
  return new NextRequest('http://localhost/api/performance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-ip-country': 'IN' },
    body: JSON.stringify(events),
  });
}

const event = {
  kind: 'navigation', route: '/invoices', metric: 'total', durationMs: 840,
  status: 'success', device: 'mobile', surface: 'pwa',
};

describe('sampled timing report endpoint', () => {
  beforeEach(() => {
    mocks.getUserIdFromRequest.mockReturnValue('user-id');
    mocks.incr.mockResolvedValue(1);
    mocks.expire.mockResolvedValue(1);
    mocks.createIndex.mockResolvedValue('index');
    mocks.bulkWrite.mockResolvedValue({});
    mocks.getDb.mockResolvedValue({
      collection: () => ({ createIndex: mocks.createIndex, bulkWrite: mocks.bulkWrite }),
    });
  });

  it('requires authentication', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);
    const response = await POST(request([event]));
    expect(response.status).toBe(401);
    expect(mocks.bulkWrite).not.toHaveBeenCalled();
  });

  it('enforces the rate limit and fails closed when Redis is unavailable', async () => {
    mocks.incr.mockResolvedValue(31);
    expect((await POST(request([event]))).status).toBe(429);
    mocks.incr.mockRejectedValue(new Error('offline'));
    expect((await POST(request([event]))).status).toBe(503);
    expect(mocks.bulkWrite).not.toHaveBeenCalled();
  });

  it('rejects identifying data and stores only grouped route templates and timing bins', async () => {
    expect((await POST(request([{ ...event, invoiceNumber: 'INV-123' }]))).status).toBe(400);
    const response = await POST(request([event]));
    expect(response.status).toBe(202);
    expect(response.headers.get('server-timing')).toContain('mongodb;dur=');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    const operations = mocks.bulkWrite.mock.calls.at(-1)?.[0];
    expect(operations).toHaveLength(1);
    expect(operations[0].updateOne.filter).toMatchObject({
      route: '/invoices', kind: 'navigation', country: 'IN',
      device: 'mobile', surface: 'pwa',
    });
    expect(JSON.stringify(operations)).not.toContain('user-id');
    expect(JSON.stringify(operations)).not.toContain('INV-123');
  });
});
