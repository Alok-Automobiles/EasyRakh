'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let intervalId: ReturnType<typeof setInterval>;
    let refreshing = false;
    const hadController = Boolean(navigator.serviceWorker.controller);

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

    const onControllerChange = () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    };

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
          console.log('SW registered: ', registration.scope);
          registration.addEventListener('updatefound', () => watchForUpdates(registration));
          registration.active?.postMessage({ type: 'CLEAR_APP_CACHES' });
          registration.update().catch(() => undefined);
          intervalId = setInterval(() => registration.update().catch(() => undefined), 15 * 60 * 1000);
        })
        .catch((error) => {
          console.log('SW registration failed: ', error);
        });
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('load', onLoad);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('load', onLoad);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return null;
}
