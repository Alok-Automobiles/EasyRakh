'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { apiRequestForTiming, parseServerTiming, PERFORMANCE_SAMPLE_RATE } from '@/lib/client-performance';
import type { PerformanceEvent } from '@/lib/performance-metrics';
import { normalizePerformanceRoute } from '@/lib/performance-routes';

const REPORT_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 10;

function clientContext(): Pick<PerformanceEvent, 'device' | 'surface'> {
  return {
    device: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
    surface: window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
      ? 'pwa' : 'browser',
  };
}

export default function PerformanceReporter() {
  const pathname = usePathname();
  const sampled = useRef(false);
  const queue = useRef<PerformanceEvent[]>([]);
  const currentRoute = useRef<string | null>(null);
  const pendingNavigation = useRef<{ route: string; start: number } | null>(null);
  const originalFetch = useRef<typeof window.fetch | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flush(useBeacon = false) {
    if (!queue.current.length) return;
    const batch = queue.current.splice(0, MAX_BATCH_SIZE);
    const body = JSON.stringify(batch);
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/performance', new Blob([body], { type: 'application/json' }));
    } else {
      void originalFetch.current?.('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body,
        keepalive: true,
      }).catch(() => {
        // Timing must never delay or interrupt a user action.
      });
    }
    if (queue.current.length) flush(useBeacon);
  }

  function enqueue(event: Omit<PerformanceEvent, 'device' | 'surface'>) {
    if (!sampled.current || !Number.isFinite(event.durationMs)) return;
    queue.current.push({
      ...event,
      durationMs: Math.max(0, Math.min(120000, Math.round(event.durationMs))),
      ...clientContext(),
    });
    if (queue.current.length >= MAX_BATCH_SIZE) flush();
    else if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        flush();
      }, REPORT_INTERVAL_MS);
    }
  }

  useEffect(() => {
    sampled.current = Math.random() < PERFORMANCE_SAMPLE_RATE;
    if (!sampled.current) return;

    const previousFetch = window.fetch;
    originalFetch.current = previousFetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = apiRequestForTiming(input, init, window.location.origin);
      if (!request) return originalFetch.current!(input, init);
      const start = performance.now();
      let status: PerformanceEvent['status'] = 'error';
      try {
        const response = await originalFetch.current!(input, init);
        status = response.ok ? 'success' : 'error';
        enqueue({
          kind: 'api', route: request.route, metric: 'network',
          durationMs: performance.now() - start, status,
        });
        for (const timing of parseServerTiming(response.headers.get('Server-Timing'))) {
          enqueue({ kind: 'api', route: request.route, status, ...timing });
        }
        if (request.ordinarySave) {
          const pageRoute = currentRoute.current;
          if (pageRoute) enqueue({
            kind: 'save', route: pageRoute, metric: 'total',
            durationMs: performance.now() - start, status,
          });
        }
        return response;
      } catch (error) {
        enqueue({
          kind: 'api', route: request.route, metric: 'network',
          durationMs: performance.now() - start, status,
        });
        if (request.ordinarySave && currentRoute.current) enqueue({
          kind: 'save', route: currentRoute.current, metric: 'total',
          durationMs: performance.now() - start, status,
        });
        throw error;
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank') return;
      try {
        const destination = new URL(href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        const route = normalizePerformanceRoute(destination.pathname, 'page');
        if (route && route !== currentRoute.current) {
          pendingNavigation.current = { route, start: performance.now() };
        }
      } catch {
        // Ignore malformed or non-navigation links.
      }
    };
    const onPopState = () => {
      const route = normalizePerformanceRoute(window.location.pathname, 'page');
      if (route) pendingNavigation.current = { route, start: performance.now() };
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Cold launch is reported separately from client-side warm navigation.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const route = normalizePerformanceRoute(window.location.pathname, 'page');
      if (route) enqueue({
        kind: 'cold_launch', route, metric: 'total',
        durationMs: performance.now(), status: 'success',
      });
    }));

    return () => {
      window.fetch = previousFetch;
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flush(true);
    };
  // This effect installs one observer for the lifetime of the provider.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const route = normalizePerformanceRoute(pathname, 'page');
    currentRoute.current = route;
    const pending = pendingNavigation.current;
    if (!pending || !route || pending.route !== route) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (pendingNavigation.current !== pending) return;
      pendingNavigation.current = null;
      enqueue({
        kind: 'navigation', route, metric: 'total',
        durationMs: performance.now() - pending.start, status: 'success',
      });
    }));
  // Only route changes indicate a completed navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
