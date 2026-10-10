'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let intervalId: ReturnType<typeof setInterval>;

    const clearAppCaches = () => {
      if (!('caches' in window)) return;
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((name) => name.startsWith('easyrakh-') || name === 'easyrakh-v1')
              .map((name) => caches.delete(name))
          )
        )
        .catch(() => undefined);
    };

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(clearAppCaches)
        .catch(() => undefined);
      return;
    }

    const watchForUpdates = (registration: ServiceWorkerRegistration) => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          registration.addEventListener('updatefound', () => watchForUpdates(registration));
          registration.active?.postMessage({ type: 'CLEAR_APP_CACHES' });
          registration.update().catch(() => undefined);
          intervalId = setInterval(() => registration.update().catch(() => undefined), 15 * 60 * 1000);
        })
        .catch((error) => {
          console.log('SW registration failed: ', error);
        });
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => {
      window.removeEventListener('load', onLoad);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return null;
}
