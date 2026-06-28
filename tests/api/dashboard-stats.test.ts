import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest } from '@/tests/helpers/api';

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
    status: 'ready',
    get: mocks.redisGet,
    setex: mocks.redisSetex,
  },
}));

describe('/api/dashboard/stats', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSetex.mockResolvedValue('OK');
  });

  it('rejects invalid month filters before cache or database work', async () => {
    const { GET } = await import('@/app/api/dashboard/stats/route');
    const response = await GET(jsonRequest('http://localhost/api/dashboard/stats?month=2026-13'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid month format. Use YYYY-MM.',
    });
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects inverted custom date ranges before cache or database work', async () => {
    const { GET } = await import('@/app/api/dashboard/stats/route');
    const response = await GET(
      jsonRequest('http://localhost/api/dashboard/stats?from=2026-06-20&to=2026-06-19')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'from must be before or equal to to.',
    });
    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('serves cached dashboard stats for period-scoped requests', async () => {
    const cached = {
      stats: { totalCredit: 1000, totalDebit: 600, netBalance: -400 },
      periodLabel: 'June 2026',
    };
    mocks.redisGet.mockResolvedValue(JSON.stringify(cached));

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const response = await GET(jsonRequest('http://localhost/api/dashboard/stats?month=2026-06'));

    expect(response.status).toBe(200);
    expect(mocks.redisGet).toHaveBeenCalledWith(`dashboard:stats:${ids.user}:2026-06`);
    expect(mocks.getDb).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual(cached);
  });
});
