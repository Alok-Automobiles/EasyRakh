import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  default: {
    eval: mocks.eval,
  },
}));

const request = (path = '/api/customers') =>
  new NextRequest(`http://localhost${path}`);

describe('rate limit helpers', () => {
  beforeEach(() => {
    mocks.eval.mockReset();
    mocks.eval.mockResolvedValue([1, 30_000]);
  });

  it('atomically increments the counter with an expiry and allows the request', async () => {
    const { checkRateLimit } = await import('@/lib/rateLimit');

    const response = await checkRateLimit(request(), {
      windowMs: 60_000,
      maxRequests: 5,
    });

    expect(response).toBeNull();
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('PEXPIRE'"),
      1, 'rateLimit:ip:unknown:/api/customers', 60_000
    );
  });

  it('returns a 429 response with retry headers after the limit is exceeded', async () => {
    mocks.eval.mockResolvedValue([6, 12_345]);
    const { checkRateLimit } = await import('@/lib/rateLimit');

    const response = await checkRateLimit(request(), {
      windowMs: 60_000,
      maxRequests: 5,
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('13');
    expect(response?.headers.get('X-RateLimit-Remaining')).toBe('0');
    await expect(response?.json()).resolves.toMatchObject({
      error: 'Too many requests',
      retryAfter: 13,
    });
  });

  it('keeps login limits separate for different client addresses', async () => {
    const { checkRateLimit, rateLimitConfigs } = await import('@/lib/rateLimit');
    const attempts = new Map<string, number>();
    mocks.eval.mockImplementation(async (_script, _count, key) => {
      const current = (attempts.get(key) || 0) + 1;
      attempts.set(key, current);
      return [current, 60_000];
    });
    const loginRequest = (ip: string) => new NextRequest('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
    });
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit(loginRequest('192.0.2.1'), rateLimitConfigs.auth)).toBeNull();
    }
    expect((await checkRateLimit(loginRequest('192.0.2.1'), rateLimitConfigs.auth))?.status).toBe(429);
    expect(await checkRateLimit(loginRequest('192.0.2.2'), rateLimitConfigs.auth)).toBeNull();
    expect(attempts.get('rateLimit:ip:192.0.2.2:/api/auth/login')).toBe(1);
  });

  it('supports custom keys and mutates responses with rate limit headers', async () => {
    const { addRateLimitHeaders, checkRateLimit } = await import('@/lib/rateLimit');

    await checkRateLimit(request('/api/search'), {
      windowMs: 10_000,
      maxRequests: 3,
      keyGenerator: () => 'rateLimit:search:ip-1',
    });

    expect(mocks.eval).toHaveBeenCalledWith(
      expect.any(String), 1, 'rateLimit:search:ip-1', 10_000
    );

    const response = addRateLimitHeaders(NextResponse.json({ ok: true }), {
      windowMs: 10_000,
      maxRequests: 3,
    }, 2);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('1');
    expect(response.headers.get('X-RateLimit-Reset')).toEqual(expect.any(String));
  });
});
