'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let intervalId: ReturnType<typeof setInterval>;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration.scope);
          intervalId = setInterval(() => registration.update(), 60 * 60 * 1000);
        })
        .catch((error) => {
          console.log('SW registration failed: ', error);
        });
    };

    window.addEventListener('load', onLoad);
    return () => {
      window.removeEventListener('load', onLoad);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return null;
}
