import { describe, expect, it } from 'vitest';
import {
  defaultInvoiceListState,
  formatInvoiceListDate,
  invoiceDatePresetRange,
  invoiceFilterErrors,
  invoiceListParams,
  invoiceListUrl,
  readInvoiceListState,
  type InvoiceDatePreset,
  type InvoiceListState,
} from '@/lib/invoice-list-state';

const filters = (patch: Partial<InvoiceListState> = {}): InvoiceListState => ({
  ...defaultInvoiceListState, ...patch,
});

describe('invoice list URL state', () => {
  it('uses all-invoice defaults and leaves their URL uncluttered', () => {
    expect(readInvoiceListState(new URLSearchParams())).toEqual(defaultInvoiceListState);
    expect(invoiceListParams(filters()).toString()).toBe('');
    expect(invoiceListUrl(filters())).toBe('/invoices');
  });

  it('roundtrips every filter, selected sort, and current page', () => {
    const selected = filters({
      search: 'Ravi & Sons', status: 'partial', customerId: 'customer/123',
      startDate: '2026-08-01', endDate: '2026-08-31',
      minAmount: '0', maxAmount: '1500.50', addedToLedger: 'false',
      sort: 'amount-desc', page: 4,
    });
    const url = new URL(invoiceListUrl(selected), 'https://example.com');
    expect(url.pathname).toBe('/invoices');
    expect(url.hash).toBe('');
    expect(readInvoiceListState(url.searchParams)).toEqual(selected);
  });

  it('trims a committed search and excludes searches below two characters', () => {
    expect(invoiceListParams(filters({ search: '  Ra  ' })).get('search')).toBe('Ra');
    expect(invoiceListParams(filters({ search: ' R ' })).has('search')).toBe(false);
  });

  it('falls back safely for unsupported categorical URL values', () => {
    expect(readInvoiceListState(new URLSearchParams('status=overdue&addedToLedger=yes&sort=unknown')))
      .toEqual(defaultInvoiceListState);
  });

  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])('rejects an invalid page %s', (page) => {
    expect(readInvoiceListState(new URLSearchParams({ page })).page).toBe(1);
  });
});

describe('invoice filter validation', () => {
  it.each([
    {},
    { startDate: '2024-02-29', endDate: '2024-02-29' },
    { startDate: '2026-01-01' },
    { endDate: '2026-12-31' },
    { minAmount: '0', maxAmount: '0' },
    { minAmount: '12.50', maxAmount: '12.50' },
    { minAmount: '100' },
    { maxAmount: '0' },
  ])('accepts valid inclusive and open ranges: %j', (patch) => {
    expect(invoiceFilterErrors(filters(patch))).toEqual({ date: undefined, amount: undefined });
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', 'invalid'])('rejects invalid dates: %s', (startDate) => {
    expect(invoiceFilterErrors(filters({ startDate })).date).toBe('Enter a valid invoice date.');
  });

  it('rejects a reversed date range', () => {
    expect(invoiceFilterErrors(filters({ startDate: '2026-09-30', endDate: '2026-09-01' })).date)
      .toBe('From date must be on or before To date.');
  });

  it.each(['-1', 'NaN', 'Infinity', '₹100', '1e3', '1,000', ' ', '1'.repeat(400)])('rejects invalid amounts: %s', (minAmount) => {
    expect(invoiceFilterErrors(filters({ minAmount })).amount).toBe('Enter a valid amount of ₹0 or more.');
  });

  it('compares amount bounds numerically', () => {
    expect(invoiceFilterErrors(filters({ minAmount: '100', maxAmount: '20' })).amount)
      .toBe('Minimum amount must not exceed maximum amount.');
    expect(invoiceFilterErrors(filters({ minAmount: '20', maxAmount: '100' })).amount).toBeUndefined();
  });
});

describe('India invoice dates', () => {
  it.each([
    ['2026-09-29T18:29:59.999Z', '2026-09-29'],
    ['2026-09-29T18:30:00.000Z', '2026-09-30'],
    ['2026-12-31T18:30:00.000Z', '2027-01-01'],
  ])('resolves today at the India midnight boundary: %s', (now, expected) => {
    expect(invoiceDatePresetRange('today', new Date(now)))
      .toEqual({ startDate: expected, endDate: expected });
  });

  it.each<[InvoiceDatePreset, string, string, string]>([
    ['last7', '2026-12-31T19:00:00Z', '2026-12-26', '2027-01-01'],
    ['last30', '2024-03-01T06:00:00Z', '2024-02-01', '2024-03-01'],
    ['month', '2026-12-31T19:00:00Z', '2027-01-01', '2027-01-01'],
    ['month', '2026-09-29T10:00:00Z', '2026-09-01', '2026-09-29'],
    ['lastMonth', '2027-01-10T10:00:00Z', '2026-12-01', '2026-12-31'],
    ['lastMonth', '2024-03-31T10:00:00Z', '2024-02-01', '2024-02-29'],
    ['lastMonth', '2026-03-31T10:00:00Z', '2026-02-01', '2026-02-28'],
  ])('resolves %s across calendar boundaries for %s', (preset, now, startDate, endDate) => {
    expect(invoiceDatePresetRange(preset, new Date(now))).toEqual({ startDate, endDate });
  });

  it.each(['all', 'custom'] as const)('does not invent a range for %s', (preset) => {
    expect(invoiceDatePresetRange(preset)).toEqual({ startDate: '', endDate: '' });
  });

  it('displays invoice timestamps using the India calendar', () => {
    expect(formatInvoiceListDate('2026-09-29T18:30:00.000Z')).toBe('30 Sept 2026');
    expect(formatInvoiceListDate('2026-09-29')).toBe('29 Sept 2026');
  });
});
