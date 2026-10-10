import type { NextRequest, NextResponse } from 'next/server';
import { normalizePerformanceRoute } from './performance-routes';

export type ApiTimingName = 'redis' | 'mongodb' | 'cache' | 'read_model';

export interface ApiTimer {
  measure<T>(name: ApiTimingName, operation: () => Promise<T>): Promise<T>;
  record(name: ApiTimingName, durationMs: number): void;
  markCache(result: 'hit' | 'miss' | 'bypass'): void;
  finish<T extends NextResponse>(response: T): T;
}

function rounded(durationMs: number): number {
  return Math.max(0, Math.round(durationMs * 10) / 10);
}

export function createApiTimer(request: NextRequest): ApiTimer {
  const startedAt = performance.now();
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const route = normalizePerformanceRoute(request.nextUrl.pathname, 'api');
  const durations = new Map<ApiTimingName, number>();
  let cacheResult: 'hit' | 'miss' | 'bypass' | undefined;

  return {
    async measure<T>(name: ApiTimingName, operation: () => Promise<T>): Promise<T> {
      const before = performance.now();
      try {
        return await operation();
      } finally {
        this.record(name, performance.now() - before);
      }
    },
    record(name, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      durations.set(name, (durations.get(name) || 0) + durationMs);
    },
    markCache(result) {
      cacheResult = result;
    },
    finish<T extends NextResponse>(response: T): T {
      const fields = Array.from(durations, ([name, duration]) => {
        const description = name === 'cache' && cacheResult ? `;desc="${cacheResult}"` : '';
        return `${name}${description};dur=${rounded(duration)}`;
      });
      fields.push(`total;dur=${rounded(performance.now() - startedAt)}`);
      const existing = response.headers.get('Server-Timing');
      response.headers.set('Server-Timing', [existing, ...fields].filter(Boolean).join(', '));
      response.headers.set('X-Request-ID', requestId);

      // Vercel logs can establish a baseline before changing infrastructure.
      // Only route templates and timings are logged; no URL, account, or data.
      if (route && Math.random() < 0.1) {
        console.info(JSON.stringify({
          type: 'api_timing',
          route,
          method: request.method,
          status: response.status,
          cache: cacheResult,
          timings: Object.fromEntries(Array.from(durations, ([name, value]) => [name, rounded(value)])),
          totalMs: rounded(performance.now() - startedAt),
        }));
      }
      return response;
    },
  };
}
