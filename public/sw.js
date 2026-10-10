const CACHE_VERSION = '2026-10-09-static-only';
const CACHE_PREFIX = 'easyrakh';
const ASSET_CACHE_NAME = `${CACHE_PREFIX}-assets-${CACHE_VERSION}`;
const CACHE_ALLOWLIST = [ASSET_CACHE_NAME];

const PRECACHE_ASSETS = [
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/manifest.json',
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EasyRakh offline</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #faf9f6;
        color: #111827;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(28rem, calc(100vw - 2rem));
        border: 4px solid #000;
        border-radius: 12px;
        background: #fff;
        padding: 1.5rem;
        box-shadow: 8px 8px 0 #000;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.25rem;
      }
      p {
        margin: 0;
        color: #4b5563;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>You are offline</h1>
      <p>Reconnect to the internet and refresh EasyRakh to load the latest records.</p>
    </main>
  </body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && !CACHE_ALLOWLIST.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_APP_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter(
                (name) =>
                  (name.startsWith(`${CACHE_PREFIX}-`) || name === 'easyrakh-v1') &&
                  !CACHE_ALLOWLIST.includes(name)
              )
              .map((name) => caches.delete(name))
          )
        )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetchNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => offlineJsonResponse()));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirstAsset(event, request));
  }
});

async function fetchNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function cacheFirstAsset(event, request) {
  const cache = await caches.open(ASSET_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()).catch(() => undefined));
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

function offlineJsonResponse() {
  return new Response(JSON.stringify({ error: 'Offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    PRECACHE_ASSETS.includes(url.pathname)
  );
}
