import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('service worker asset policy', () => {
  it('serves immutable assets without a network request, but always fetches APIs', async () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const cached = new Response('cached chunk');
    const match = vi.fn().mockResolvedValue(cached);
    const put = vi.fn().mockResolvedValue(undefined);
    const network = vi.fn().mockResolvedValue(new Response('network'));
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
      self: { location: { origin: 'https://app.test' }, addEventListener: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn) },
      caches: { open: async () => ({ match, put }) }, fetch: network, URL, Response,
    });
    const dispatch = (pathname: string) => {
      let result!: Promise<Response>;
      handlers.get('fetch')!({ request: { method: 'GET', url: `https://app.test${pathname}`, mode: 'cors' },
        respondWith: (response: Promise<Response>) => { result = response; }, waitUntil: vi.fn() });
      return result;
    };
    expect(await dispatch('/_next/static/chunks/hash.js')).toBe(cached);
    expect(network).not.toHaveBeenCalled();
    await dispatch('/api/customers');
    expect(network).toHaveBeenCalledTimes(1);
    match.mockResolvedValueOnce(undefined);
    await dispatch('/_next/static/chunks/new-hash.js');
    expect(network).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(1);
    // A changing public asset still checks the network.
    await dispatch('/manifest.json');
    expect(network).toHaveBeenCalledTimes(3);
  });
});
