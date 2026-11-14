export const METRIC_NAMES = ['CLS', 'LCP', 'INP', 'FCP', 'TTFB'] as const;
export const PERFORMANCE_PAGES = [
  'dashboard', 'customers', 'suppliers', 'inventory', 'inventory-items',
  'invoices', 'invoice-editor', 'ledger', 'transactions', 'other',
] as const;

export function performancePage(pathname: string): typeof PERFORMANCE_PAGES[number] {
  if (pathname === '/invoices/new' || /^\/invoices\/[^/]+$/.test(pathname)) return 'invoice-editor';
  const section = pathname.split('/')[1];
  return PERFORMANCE_PAGES.includes(section as typeof PERFORMANCE_PAGES[number])
    ? section as typeof PERFORMANCE_PAGES[number] : 'other';
}

export function parsePerformanceMetric(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const { name, value, page, device } = input as Record<string, unknown>;
  if (!METRIC_NAMES.includes(name as typeof METRIC_NAMES[number]) ||
      !PERFORMANCE_PAGES.includes(page as typeof PERFORMANCE_PAGES[number]) ||
      typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 3_600_000 ||
      (device !== 'mobile' && device !== 'desktop')) return null;
  // Explicitly select fields; ignore IDs, URLs, query strings and attribution DOM.
  return { event: 'browser_performance', name, value, page, device };
}
