import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type FetchEvent = {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (promise: Promise<unknown>) => void;
};

function loadServiceWorker(fetchMock: typeof fetch, cache: {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}) {
  const listeners = new Map<string, (event: FetchEvent) => void>();
  const source = readFileSync('public/sw.js', 'utf8');
  runInNewContext(source, {
    self: {
      location: { origin: 'https://easyrakh.test' },
      addEventListener: (name: string, listener: (event: FetchEvent) => void) => listeners.set(name, listener),
    },
    caches: { open: vi.fn().mockResolvedValue(cache) },
    fetch: fetchMock,
    URL,
    Response,
  });
  return listeners.get('fetch')!;
}

async function dispatchFetch(listener: (event: FetchEvent) => void, path: string) {
  let responsePromise: Promise<Response> | undefined;
  const request = new Request(`https://easyrakh.test${path}`);
  listener({
    request,
    respondWith: (response) => { responsePromise = response; },
    waitUntil: vi.fn(),
  });
  return responsePromise ? await responsePromise : null;
}

describe('service worker asset cache', () => {
  it('serves versioned static files from cache without waiting for a network request', async () => {
    const fetchMock = vi.fn();
    const cache = { match: vi.fn().mockResolvedValue(new Response('cached')), put: vi.fn() };
    const listener = loadServiceWorker(fetchMock, cache);

    const response = await dispatchFetch(listener, '/_next/static/chunks/abc123.js');
    expect(await response?.text()).toBe('cached');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never stores authenticated APIs or arbitrary image paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ secret: 'server-only' }));
    const cache = { match: vi.fn(), put: vi.fn() };
    const listener = loadServiceWorker(fetchMock, cache);

    expect((await dispatchFetch(listener, '/api/invoices'))?.status).toBe(200);
    expect(await dispatchFetch(listener, '/private-invoice-image.png')).toBeNull();
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});
