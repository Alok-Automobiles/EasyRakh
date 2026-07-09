import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import {
  CACHE_WRITE_BARRIER_COOKIE,
  CACHE_WRITE_BARRIER_SECONDS,
} from '@/lib/cache-consistency';

describe('API cache consistency middleware', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'sets a short read-after-write barrier for %s requests',
    (method) => {
      const response = proxy(
        new NextRequest('http://localhost/api/customers/customer-1', { method })
      );
      const barrier = response.cookies.get(CACHE_WRITE_BARRIER_COOKIE);

      expect(barrier?.value).toBe('1');
      expect(barrier?.httpOnly).toBe(true);
      expect(barrier?.path).toBe('/api');
      expect(barrier?.maxAge).toBe(CACHE_WRITE_BARRIER_SECONDS);
    }
  );

  it('does not set a write barrier for API reads', () => {
    const response = proxy(
      new NextRequest('http://localhost/api/customers', { method: 'GET' })
    );

    expect(response.cookies.get(CACHE_WRITE_BARRIER_COOKIE)).toBeUndefined();
  });
});
