import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  generateToken: vi.fn(),
  getDb: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: mocks.compare,
  },
}));

vi.mock('@/lib/auth', () => ({
  generateToken: mocks.generateToken,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitConfigs: {
    auth: { windowMs: 60_000, maxRequests: 5 },
  },
}));

const createRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  });

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    mocks.compare.mockReset();
    mocks.generateToken.mockReset();
    mocks.getDb.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.checkRateLimit.mockResolvedValue(null);
  });

  it('returns a rate limit response before reading credentials', async () => {
    const limitedResponse = NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
    mocks.checkRateLimit.mockResolvedValue(limitedResponse);

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(createRequest({ email: 'owner@example.com', password: 'secret' }));

    expect(response.status).toBe(429);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects invalid email input', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(createRequest({ email: 'bad-email', password: 'secret' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid email address' });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects missing users with the generic auth error', async () => {
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: vi.fn().mockResolvedValue(null),
      })),
    });

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      createRequest({ email: 'owner@example.com', password: 'secret' })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid email or password',
    });
  });

  it('logs in valid users and sets the token cookie', async () => {
    const findOne = vi.fn().mockResolvedValue({
      _id: { toString: () => 'user-1' },
      name: 'Shop Owner',
      email: 'owner@example.com',
      password: 'hashed-password',
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne,
      })),
    });
    mocks.compare.mockResolvedValue(true);
    mocks.generateToken.mockReturnValue('signed-jwt');

    const { POST } = await import('@/app/api/auth/login/route');
    const response = await POST(
      createRequest({ email: 'OWNER@EXAMPLE.COM', password: 'secret' })
    );

    expect(response.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith({ email: 'owner@example.com' });
    expect(mocks.compare).toHaveBeenCalledWith('secret', 'hashed-password');
    await expect(response.json()).resolves.toEqual({
      message: 'Login successful',
      token: 'signed-jwt',
      user: {
        id: 'user-1',
        name: 'Shop Owner',
        email: 'owner@example.com',
      },
    });
    expect(response.headers.get('set-cookie')).toContain('token=signed-jwt');
  });
});
