import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { generateToken, getUserIdFromRequest, verifyToken } from '@/lib/auth';

describe('auth token helpers', () => {
  it('generates verifiable JWTs with the expected payload', () => {
    const token = generateToken({
      userId: 'user-123',
      email: 'owner@example.com',
    });

    expect(verifyToken(token)).toMatchObject({
      userId: 'user-123',
      email: 'owner@example.com',
    });
  });

  it('returns null for invalid tokens', () => {
    expect(verifyToken('not-a-real-token')).toBeNull();
  });

  it('reads bearer tokens before cookies', () => {
    const bearerToken = generateToken({
      userId: 'from-header',
      email: 'header@example.com',
    });
    const cookieToken = generateToken({
      userId: 'from-cookie',
      email: 'cookie@example.com',
    });

    const request = new NextRequest('http://localhost/api/auth/me', {
      headers: {
        authorization: `Bearer ${bearerToken}`,
        cookie: `token=${cookieToken}`,
      },
    });

    expect(getUserIdFromRequest(request)).toBe('from-header');
  });

  it('falls back to the auth cookie when no bearer token exists', () => {
    const token = generateToken({
      userId: 'cookie-user',
      email: 'cookie@example.com',
    });
    const request = new NextRequest('http://localhost/api/auth/me', {
      headers: {
        cookie: `token=${token}`,
      },
    });

    expect(getUserIdFromRequest(request)).toBe('cookie-user');
  });
});
