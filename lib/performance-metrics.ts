import { performanceRouteTemplates } from './performance-routes';

export type PerformanceKind = 'navigation' | 'save' | 'cold_launch' | 'api';
export type PerformanceMetric = 'network' | 'total' | 'redis' | 'mongodb' | 'cache' | 'read_model';
export type PerformanceDevice = 'mobile' | 'desktop';
export type PerformanceStatus = 'success' | 'error';
export type PerformanceSurface = 'pwa' | 'browser';

export interface PerformanceEvent {
  kind: PerformanceKind;
  route: string;
  metric: PerformanceMetric;
  durationMs: number;
  status: PerformanceStatus;
  device: PerformanceDevice;
  surface: PerformanceSurface;
  cacheResult?: 'hit' | 'miss' | 'bypass';
}

// The 50 ms bins around the one-second target make the reported p95 a
// conservative upper bound within 50 ms. Larger work has coarser bins.
export const timingBucketUpperBounds = [
  ...Array.from({ length: 40 }, (_, index) => (index + 1) * 50),
  2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000,
  30000, 45000, 60000, 90000, 120000,
];

const allowedRoutes = new Set(performanceRouteTemplates);
const allowedKinds = new Set<PerformanceKind>(['navigation', 'save', 'cold_launch', 'api']);
const allowedMetrics = new Set<PerformanceMetric>([
  'network', 'total', 'redis', 'mongodb', 'cache', 'read_model',
]);

export function timingBucket(durationMs: number): number {
  const index = timingBucketUpperBounds.findIndex((upperBound) => durationMs <= upperBound);
  return index < 0 ? timingBucketUpperBounds.length - 1 : index;
}

export function validatePerformanceEvent(value: unknown): PerformanceEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => ![
    'kind', 'route', 'metric', 'durationMs', 'status', 'device', 'surface', 'cacheResult',
  ].includes(key))) return null;
  if (!allowedKinds.has(event.kind as PerformanceKind)) return null;
  if (typeof event.route !== 'string' || !allowedRoutes.has(event.route)) return null;
  if (!allowedMetrics.has(event.metric as PerformanceMetric)) return null;
  if (typeof event.durationMs !== 'number' || !Number.isFinite(event.durationMs) ||
    event.durationMs < 0 || event.durationMs > 120000) return null;
  if (event.status !== 'success' && event.status !== 'error') return null;
  if (event.device !== 'mobile' && event.device !== 'desktop') return null;
  if (event.surface !== 'pwa' && event.surface !== 'browser') return null;
  if (event.kind === 'api' ? !event.route.startsWith('/api/') : event.route.startsWith('/api/')) return null;
  if (event.kind !== 'api' && event.metric !== 'total') return null;
  if (event.cacheResult !== undefined && (
    event.kind !== 'api' || event.metric !== 'cache' ||
    !['hit', 'miss', 'bypass'].includes(event.cacheResult as string)
  )) return null;
  return event as unknown as PerformanceEvent;
}

export function percentileUpperBound(histogram: Record<string, number>, percentile: number): number | null {
  const total = Object.values(histogram).reduce((sum, value) => sum + value, 0);
  if (total === 0) return null;
  const target = Math.ceil(total * percentile);
  let cumulative = 0;
  for (let index = 0; index < timingBucketUpperBounds.length; index += 1) {
    cumulative += histogram[`b${index}`] || 0;
    if (cumulative >= target) return timingBucketUpperBounds[index];
  }
  return timingBucketUpperBounds.at(-1) || null;
}
