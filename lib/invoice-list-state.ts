export const invoiceSortOptions = [
  ['default', 'Default order'],
  ['date-desc', 'Invoice date: newest'],
  ['date-asc', 'Invoice date: oldest'],
  ['amount-desc', 'Amount: highest'],
  ['amount-asc', 'Amount: lowest'],
] as const;

export const invoiceDateOptions = [
  ['all', 'All dates'],
  ['today', 'Today'],
  ['last7', 'Last 7 days'],
  ['last30', 'Last 30 days'],
  ['month', 'This month'],
  ['lastMonth', 'Last month'],
  ['custom', 'Custom range'],
] as const;

export type InvoiceDatePreset = typeof invoiceDateOptions[number][0];
export type InvoiceListState = {
  search: string;
  status: 'all' | 'paid' | 'partial' | 'unpaid';
  customerId: string;
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
  addedToLedger: 'all' | 'true' | 'false';
  sort: typeof invoiceSortOptions[number][0];
  page: number;
};

export const defaultInvoiceListState: InvoiceListState = {
  search: '', status: 'all', customerId: '', startDate: '', endDate: '',
  minAmount: '', maxAmount: '', addedToLedger: 'all', sort: 'default', page: 1,
};

export function readInvoiceListState(params: Pick<URLSearchParams, 'get'>): InvoiceListState {
  const status = params.get('status');
  const ledger = params.get('addedToLedger');
  const sort = params.get('sort');
  const page = Number(params.get('page') || 1);
  return {
    search: params.get('search') || '',
    status: status === 'paid' || status === 'unpaid' || status === 'partial' ? status : 'all',
    customerId: params.get('customerId') || '',
    startDate: params.get('startDate') || '',
    endDate: params.get('endDate') || '',
    minAmount: params.get('minAmount') || '',
    maxAmount: params.get('maxAmount') || '',
    addedToLedger: ledger === 'true' || ledger === 'false' ? ledger : 'all',
    sort: invoiceSortOptions.find(([value]) => value === sort)?.[0] || 'default',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function invoiceListParams(filters: InvoiceListState) {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search.length >= 2) params.set('search', search);
  if (filters.status !== 'all') params.set('status', filters.status);
  for (const key of ['customerId', 'startDate', 'endDate', 'minAmount', 'maxAmount'] as const) {
    if (filters[key] !== '') params.set(key, filters[key]);
  }
  if (filters.addedToLedger !== 'all') params.set('addedToLedger', filters.addedToLedger);
  if (filters.sort !== 'default') params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

export function invoiceListUrl(filters: InvoiceListState) {
  const query = invoiceListParams(filters).toString();
  return `/invoices${query ? `?${query}` : ''}`;
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function invoiceFilterErrors(filters: InvoiceListState) {
  let date: string | undefined;
  let amount: string | undefined;
  if ([filters.startDate, filters.endDate].some((value) => value && !isDateOnly(value))) {
    date = 'Enter a valid invoice date.';
  } else if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    date = 'From date must be on or before To date.';
  }
  const amounts = [filters.minAmount, filters.maxAmount];
  if (amounts.some((value) => value !== '' && (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))))) {
    amount = 'Enter a valid amount of ₹0 or more.';
  } else if (amounts.every((value) => value !== '') && Number(amounts[0]) > Number(amounts[1])) {
    amount = 'Minimum amount must not exceed maximum amount.';
  }
  return { date, amount };
}

export function invoiceDatePresetRange(preset: InvoiceDatePreset, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  if (preset === 'all' || preset === 'custom') return { startDate: '', endDate: '' };
  if (preset === 'last7') start.setUTCDate(start.getUTCDate() - 6);
  if (preset === 'last30') start.setUTCDate(start.getUTCDate() - 29);
  if (preset === 'month') start.setUTCDate(1);
  if (preset === 'lastMonth') {
    end.setUTCDate(0);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function formatInvoiceListDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value));
}
