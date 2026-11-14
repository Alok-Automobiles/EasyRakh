import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePerformanceMetric, performancePage } from '@/lib/performance-metrics';
import { timeStage, withRequestTiming } from '@/lib/request-timing';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('performance measurements', () => {
  it('keeps request timings isolated across overlapping requests', async () => {
    const one = withRequestTiming('/api/one', async () => {
      await timeStage('summary', async () => { await Promise.resolve(); });
      return new Response(null, { status: 204 });
    });
    const two = withRequestTiming('/api/two', async () => {
      await timeStage('redis', async () => { await Promise.resolve(); });
      return Response.json({});
    });
    const [first, second] = await Promise.all([one(), two()]);
    expect(first.headers.get('Server-Timing')).toMatch(/total;dur=.*summary;dur=/);
    expect(first.headers.get('Server-Timing')).not.toContain('redis');
    expect(second.headers.get('Server-Timing')).toContain('redis;dur=');
    expect(second.headers.get('Server-Timing')).not.toContain('summary');
  });

  it('does not retain URL identifiers or arbitrary telemetry fields', () => {
    expect(performancePage('/ledger/customer/private-id')).toBe('ledger');
    expect(performancePage('/invoices/private-id')).toBe('invoice-editor');
    expect(performancePage('/private-page')).toBe('other');
    expect(parsePerformanceMetric({ name: 'INP', value: 120, page: 'customers', device: 'mobile', email: 'secret' }))
      .toEqual({ event: 'browser_performance', name: 'INP', value: 120, page: 'customers', device: 'mobile' });
    expect(parsePerformanceMetric({ name: 'INP', value: Infinity, page: 'customers', device: 'mobile' })).toBeNull();
    expect(parsePerformanceMetric({ name: 'INP', value: 10, page: '/customers/private-id', device: 'mobile' })).toBeNull();
  });

  it('bounds cache waits, skips work during outages, and recovers after cooldown', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { optionalCache } = await import('@/lib/cache-deadline');
    const hanging = vi.fn(() => new Promise<string>(() => {}));
    const read = optionalCache(hanging, 'fallback');
    await vi.advanceTimersByTimeAsync(150);
    await expect(read).resolves.toBe('fallback');
    const healthy = vi.fn().mockResolvedValue('value');
    await expect(optionalCache(healthy, 'fallback')).resolves.toBe('fallback');
    expect(healthy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(optionalCache(healthy, 'fallback')).resolves.toBe('value');
    expect(vi.getTimerCount()).toBe(0);
  });
});
