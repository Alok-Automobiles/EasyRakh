import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

const createRequest = (path: string, token?: string) => {
  const headers = token ? { cookie: `token=${token}` } : undefined;
  return new NextRequest(`http://localhost${path}`, { headers });
};

describe('middleware auth redirects', () => {
  it('sends logged-in visits to the site root directly to the dashboard', () => {
    const response = middleware(createRequest('/', 'signed-jwt'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('allows the dashboard logo landing view for logged-in users', () => {
    const response = middleware(createRequest('/?view=landing', 'signed-jwt'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('keeps the landing page public for logged-out users', () => {
    const response = middleware(createRequest('/'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects logged-out users away from protected routes', () => {
    const response = middleware(createRequest('/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });
});
