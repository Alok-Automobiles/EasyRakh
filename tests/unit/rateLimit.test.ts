import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  incr: vi.fn(),
  pexpire: vi.fn(),
  pttl: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  default: {
    incr: mocks.incr,
    pexpire: mocks.pexpire,
    pttl: mocks.pttl,
  },
}));

const request = (path = '/api/customers') =>
  new NextRequest(`http://localhost${path}`);

describe('rate limit helpers', () => {
  beforeEach(() => {
    mocks.incr.mockReset();
    mocks.pexpire.mockReset();
    mocks.pttl.mockReset();
    mocks.incr.mockResolvedValue(1);
    mocks.pexpire.mockResolvedValue(1);
    mocks.pttl.mockResolvedValue(30_000);
  });

  it('sets a window expiry only on the first hit and allows the request', async () => {
    const { checkRateLimit } = await import('@/lib/rateLimit');

    const response = await checkRateLimit(request(), {
      windowMs: 60_000,
      maxRequests: 5,
    });

    expect(response).toBeNull();
    expect(mocks.incr).toHaveBeenCalledWith('rateLimit:anonymous:/api/customers');
    expect(mocks.pexpire).toHaveBeenCalledWith('rateLimit:anonymous:/api/customers', 60_000);
  });

  it('returns a 429 response with retry headers after the limit is exceeded', async () => {
    mocks.incr.mockResolvedValue(6);
    mocks.pttl.mockResolvedValue(12_345);
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

  it('supports custom keys and mutates responses with rate limit headers', async () => {
    const { addRateLimitHeaders, checkRateLimit } = await import('@/lib/rateLimit');

    await checkRateLimit(request('/api/search'), {
      windowMs: 10_000,
      maxRequests: 3,
      keyGenerator: () => 'rateLimit:search:ip-1',
    });

    expect(mocks.incr).toHaveBeenCalledWith('rateLimit:search:ip-1');

    const response = addRateLimitHeaders(NextResponse.json({ ok: true }), {
      windowMs: 10_000,
      maxRequests: 3,
    }, 2);

    expect(response.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('1');
    expect(response.headers.get('X-RateLimit-Reset')).toEqual(expect.any(String));
  });
});
