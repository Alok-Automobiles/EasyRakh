import type { PerformanceMetric } from './performance-metrics';
import { normalizePerformanceRoute } from './performance-routes';

export const PERFORMANCE_SAMPLE_RATE = 0.1;

export interface ServerTimingValue {
  metric: PerformanceMetric;
  durationMs: number;
  cacheResult?: 'hit' | 'miss' | 'bypass';
}

export function parseServerTiming(header: string | null): ServerTimingValue[] {
  if (!header) return [];
  const values: ServerTimingValue[] = [];
  for (const part of header.split(',')) {
    const match = part.trim().match(/^(redis|mongodb|cache|read_model|total)(?:;desc="(hit|miss|bypass)")?;dur=(\d+(?:\.\d+)?)$/);
    if (!match) continue;
    const durationMs = Number(match[3]);
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 120000) continue;
    values.push({
      metric: match[1] as PerformanceMetric,
      durationMs,
      ...(match[1] === 'cache' && match[2] ? { cacheResult: match[2] as 'hit' | 'miss' | 'bypass' } : {}),
    });
  }
  return values;
}

export function apiRequestForTiming(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  origin: string
): { route: string; method: string; ordinarySave: boolean } | null {
  const rawUrl = input instanceof Request ? input.url : String(input);
  let url: URL;
  try {
    url = new URL(rawUrl, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) return null;
  if (url.pathname === '/api/performance' || url.pathname.startsWith('/api/admin/performance')) return null;
  const route = normalizePerformanceRoute(url.pathname, 'api');
  if (!route) return null;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const ordinarySave = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    !url.pathname.startsWith('/api/uploads/') &&
    !url.pathname.startsWith('/api/auth/') &&
    !url.pathname.includes('/download') &&
    !url.pathname.includes('/export-pdf') &&
    !url.pathname.startsWith('/api/voice-assistant');
  return { route, method, ordinarySave };
}
