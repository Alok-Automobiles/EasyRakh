// Only route templates reach telemetry. Never send URL queries, record IDs, or
// user-created collection names to the timing endpoint.
const pageRoutes: Array<[RegExp, string]> = [
  [/^\/dashboard$/, '/dashboard'],
  [/^\/invoices\/new$/, '/invoices/new'],
  [/^\/invoices\/[^/]+$/, '/invoices/[id]'],
  [/^\/invoices$/, '/invoices'],
  [/^\/customers$/, '/customers'],
  [/^\/suppliers$/, '/suppliers'],
  [/^\/inventory-items$/, '/inventory-items'],
  [/^\/ledger\/[^/]+\/[^/]+$/, '/ledger/[entityType]/[entityId]'],
  [/^\/custom-entities\/[^/]+$/, '/custom-entities/[collectionType]'],
  [/^\/collection-types$/, '/collection-types'],
  [/^\/transactions\/new$/, '/transactions/new'],
  [/^\/daily-cash-record$/, '/daily-cash-record'],
  [/^\/notes$/, '/notes'],
  [/^\/profile$/, '/profile'],
];

const apiRoutes: Array<[RegExp, string]> = [
  [/^\/api\/bootstrap$/, '/api/bootstrap'],
  [/^\/api\/dashboard\/stats$/, '/api/dashboard/stats'],
  [/^\/api\/invoices\/[^/]+\/payments\/[^/]+$/, '/api/invoices/[id]/payments/[paymentId]'],
  [/^\/api\/invoices\/[^/]+\/payments$/, '/api/invoices/[id]/payments'],
  [/^\/api\/invoices\/next-number$/, '/api/invoices/next-number'],
  [/^\/api\/invoices\/[^/]+$/, '/api/invoices/[id]'],
  [/^\/api\/invoices$/, '/api/invoices'],
  [/^\/api\/customers\/[^/]+$/, '/api/customers/[id]'],
  [/^\/api\/customers$/, '/api/customers'],
  [/^\/api\/suppliers\/[^/]+$/, '/api/suppliers/[id]'],
  [/^\/api\/suppliers$/, '/api/suppliers'],
  [/^\/api\/inventory\/suggestions$/, '/api/inventory/suggestions'],
  [/^\/api\/inventory\/check-number$/, '/api/inventory/check-number'],
  [/^\/api\/inventory\/[^/]+$/, '/api/inventory/[id]'],
  [/^\/api\/inventory$/, '/api/inventory'],
  [/^\/api\/transactions\/[^/]+$/, '/api/transactions/[id]'],
  [/^\/api\/transactions$/, '/api/transactions'],
  [/^\/api\/ledger\/[^/]+\/[^/]+$/, '/api/ledger/[entityType]/[entityId]'],
  [/^\/api\/custom-entities\/[^/]+$/, '/api/custom-entities/[id]'],
  [/^\/api\/custom-entities$/, '/api/custom-entities'],
  [/^\/api\/collection-types\/[^/]+$/, '/api/collection-types/[id]'],
  [/^\/api\/collection-types$/, '/api/collection-types'],
  [/^\/api\/daily-cash-records\/[^/]+$/, '/api/daily-cash-records/[id]'],
  [/^\/api\/daily-cash-records$/, '/api/daily-cash-records'],
  [/^\/api\/business-cash$/, '/api/business-cash'],
  [/^\/api\/notes\/[^/]+$/, '/api/notes/[id]'],
  [/^\/api\/notes$/, '/api/notes'],
  [/^\/api\/search$/, '/api/search'],
];

function pathOnly(input: string): string | null {
  try {
    // URL() handles absolute input; relative paths are treated against a fixed
    // origin that is never returned or persisted.
    const pathname = new URL(input, 'https://easyrakh.invalid').pathname;
    return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  } catch {
    return null;
  }
}

export function normalizePerformanceRoute(input: string, kind: 'page' | 'api'): string | null {
  const pathname = pathOnly(input);
  if (!pathname) return null;
  const patterns = kind === 'api' ? apiRoutes : pageRoutes;
  for (const [pattern, template] of patterns) {
    if (pattern.test(pathname)) return template;
  }
  return null;
}

export const performanceRouteTemplates = [
  ...pageRoutes.map(([, template]) => template),
  ...apiRoutes.map(([, template]) => template),
];
