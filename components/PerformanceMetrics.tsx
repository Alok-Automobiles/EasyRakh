'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { METRIC_NAMES, performancePage } from '@/lib/performance-metrics';

let sampled: boolean | undefined;
const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (process.env.NEXT_PUBLIC_PERFORMANCE_METRICS !== '1') return;
  sampled ??= Math.random() < 0.1;
  if (!sampled || !METRIC_NAMES.includes(metric.name as typeof METRIC_NAMES[number])) return;
  const payload = JSON.stringify({
    name: metric.name, value: metric.value, page: performancePage(window.location.pathname),
    device: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
  });
  void fetch('/api/performance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: payload, keepalive: true, credentials: 'omit',
  }).catch(() => undefined);
};

export default function PerformanceMetrics() {
  useReportWebVitals(report);
  return null;
}
