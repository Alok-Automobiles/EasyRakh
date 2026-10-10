import { describe, expect, it } from 'vitest';
import { apiRequestForTiming, parseServerTiming } from '@/lib/client-performance';
import { percentileUpperBound, timingBucket, validatePerformanceEvent } from '@/lib/performance-metrics';
import { normalizePerformanceRoute } from '@/lib/performance-routes';

describe('privacy-safe performance measurements', () => {
  it('uses route templates and drops queries and unknown paths', () => {
    expect(normalizePerformanceRoute('/invoices/673f07a27bca?customer=Rita', 'page')).toBe('/invoices/[id]');
    expect(normalizePerformanceRoute('/api/ledger/customer/673f07a27bca?search=secret', 'api'))
      .toBe('/api/ledger/[entityType]/[entityId]');
    expect(normalizePerformanceRoute('/new-private-screen/client-name', 'page')).toBeNull();
  });

  it('rejects business content, account IDs, invalid metrics, and out-of-range durations', () => {
    const valid = {
      kind: 'navigation', route: '/invoices', metric: 'total', durationMs: 815,
      status: 'success', device: 'mobile', surface: 'pwa',
    };
    expect(validatePerformanceEvent(valid)).toEqual(valid);
    expect(validatePerformanceEvent({ ...valid, customerName: 'Private' })).toBeNull();
    expect(validatePerformanceEvent({ ...valid, route: '/invoices/673f07a27bca' })).toBeNull();
    expect(validatePerformanceEvent({ ...valid, metric: 'redis' })).toBeNull();
    expect(validatePerformanceEvent({ ...valid, durationMs: 120001 })).toBeNull();
  });

  it('reports conservative p50/p95 bounds from fixed histogram bins', () => {
    const histogram: Record<string, number> = {};
    for (const duration of [50, 51, 100, 900, 1000, 1050, 1500, 2000, 3000, 5000]) {
      const bucket = `b${timingBucket(duration)}`;
      histogram[bucket] = (histogram[bucket] || 0) + 1;
    }
    expect(percentileUpperBound(histogram, 0.5)).toBe(1000);
    expect(percentileUpperBound(histogram, 0.95)).toBe(5000);
  });

  it('parses only allowlisted server timing metrics and marks cache hits', () => {
    expect(parseServerTiming('proxy;dur=1.2, redis;dur=24.1, cache;desc="hit";dur=3, total;dur=90'))
      .toEqual([
        { metric: 'redis', durationMs: 24.1 },
        { metric: 'cache', durationMs: 3, cacheResult: 'hit' },
        { metric: 'total', durationMs: 90 },
      ]);
  });

  it('keeps uploads out of ordinary save timing', () => {
    const origin = 'https://www.easyrakh.com';
    expect(apiRequestForTiming('/api/invoices/abc?private=data', { method: 'PUT' }, origin)).toEqual({
      route: '/api/invoices/[id]', method: 'PUT', ordinarySave: true,
    });
    expect(apiRequestForTiming('/api/uploads/bill', { method: 'POST' }, origin)).toBeNull();
    expect(apiRequestForTiming('https://external.example/api/invoices', undefined, origin)).toBeNull();
  });
});
