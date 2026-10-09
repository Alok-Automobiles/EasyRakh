import { useSyncExternalStore } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvoiceListFilters } from '@/lib/hooks/useInvoiceListFilters';
import { defaultInvoiceListState } from '@/lib/invoice-list-state';

vi.mock('next/navigation', () => ({
  useSearchParams: () => {
    const query = useSyncExternalStore(
      (callback) => {
        window.addEventListener('invoice-location-change', callback);
        window.addEventListener('popstate', callback);
        return () => {
          window.removeEventListener('invoice-location-change', callback);
          window.removeEventListener('popstate', callback);
        };
      },
      () => window.location.search,
    );
    return new URLSearchParams(query);
  },
}));

const originalReplaceState = window.history.replaceState.bind(window.history);

function visit(query = '') {
  originalReplaceState(null, '', `/invoices${query ? `?${query}` : ''}`);
}

function elapse(milliseconds = 350) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

describe('invoice list filter state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visit();
    vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
      originalReplaceState(data, unused, url);
      window.dispatchEvent(new Event('invoice-location-change'));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('restores all committed filters and pagination on initial load', () => {
    visit('search=Ravi&status=partial&customerId=c1&startDate=2026-09-01&endDate=2026-09-30&minAmount=0&maxAmount=1000&addedToLedger=false&sort=amount-desc&page=4');
    const { result } = renderHook(useInvoiceListFilters);
    expect(result.current.filters).toEqual({
      search: 'Ravi', status: 'partial', customerId: 'c1',
      startDate: '2026-09-01', endDate: '2026-09-30',
      minAmount: '0', maxAmount: '1000', addedToLedger: 'false', sort: 'amount-desc', page: 4,
    });
    expect(result.current.draft).toEqual(result.current.filters);
  });

  it('debounces searches for 350 ms and requires two trimmed characters', () => {
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ search: 'R' }, true));
    elapse();
    expect(result.current.draft.search).toBe('R');
    expect(result.current.filters.search).toBe('');
    expect(window.location.search).toBe('');

    act(() => result.current.change({ search: '  Ra  ' }, true));
    elapse(349);
    expect(result.current.filters.search).toBe('');
    elapse(1);
    expect(result.current.filters.search).toBe('Ra');
    expect(new URLSearchParams(window.location.search).get('search')).toBe('Ra');
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
  });

  it('cancels obsolete search debounces and removes a committed search below the threshold', () => {
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ search: 'Ra' }, true));
    elapse(200);
    act(() => result.current.change({ search: 'Ravi' }, true));
    elapse(150);
    expect(result.current.filters.search).toBe('');
    elapse(200);
    expect(result.current.filters.search).toBe('Ravi');
    act(() => result.current.change({ search: 'R' }, true));
    elapse();
    expect(result.current.filters.search).toBe('');
    expect(window.location.search).toBe('');
  });

  it('debounces both amount boundaries and resets the page only when committed', () => {
    visit('page=4&status=paid');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ minAmount: '0', maxAmount: '100.50' }, true));
    elapse(349);
    expect(result.current.filters).toMatchObject({ minAmount: '', maxAmount: '', page: 4 });
    elapse(1);
    expect(result.current.filters).toMatchObject({ minAmount: '0', maxAmount: '100.50', page: 1, status: 'paid' });
    expect(new URLSearchParams(window.location.search).get('minAmount')).toBe('0');
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false);
  });

  it('commits selected customer, status, and sorting immediately while retaining other filters', () => {
    visit('search=Ravi&minAmount=100&sort=date-asc&page=3');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ customerId: 'customer-1' }));
    expect(result.current.filters).toMatchObject({ customerId: 'customer-1', search: 'Ravi', minAmount: '100', sort: 'date-asc', page: 1 });
    act(() => result.current.setPage(2));
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2');
    act(() => result.current.change({ status: 'unpaid', sort: 'amount-desc' }));
    expect(result.current.filters).toMatchObject({ customerId: 'customer-1', status: 'unpaid', search: 'Ravi', minAmount: '100', sort: 'amount-desc', page: 1 });
  });

  it('keeps an in-progress search when an immediate filter is selected', () => {
    visit('search=old&minAmount=100');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ search: 'new' }, true));
    elapse(100);
    act(() => result.current.change({ addedToLedger: 'true' }));
    expect(result.current.filters).toMatchObject({ search: 'old', addedToLedger: 'true', minAmount: '100' });
    expect(result.current.draft.search).toBe('new');
    elapse();
    expect(result.current.filters).toMatchObject({ search: 'new', addedToLedger: 'true', minAmount: '100' });
  });

  it('keeps the last committed amounts while the draft range is invalid, then applies a correction', () => {
    visit('minAmount=100&maxAmount=200&page=2');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ minAmount: '300' }, true));
    elapse();
    expect(result.current.draft.minAmount).toBe('300');
    expect(result.current.filters).toMatchObject({ minAmount: '100', maxAmount: '200', page: 2 });
    act(() => result.current.change({ status: 'paid' }));
    expect(result.current.filters).toMatchObject({ minAmount: '100', maxAmount: '200', status: 'paid' });
    expect(result.current.draft.minAmount).toBe('300');
    act(() => result.current.change({ maxAmount: '400' }, true));
    elapse();
    expect(result.current.filters).toMatchObject({ minAmount: '300', maxAmount: '400', status: 'paid', page: 1 });
  });

  it('keeps the last committed dates while the draft range is invalid, then applies both corrected dates', () => {
    visit('startDate=2026-09-01&endDate=2026-09-30&page=3');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ startDate: '2026-10-01' }));
    elapse();
    expect(result.current.filters).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30', page: 3 });
    expect(result.current.draft.startDate).toBe('2026-10-01');
    act(() => result.current.change({ customerId: 'c1' }));
    expect(result.current.filters).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30', customerId: 'c1' });
    act(() => result.current.change({ endDate: '2026-10-31' }));
    expect(result.current.filters).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-31', customerId: 'c1', page: 1 });
  });

  it('clears all filters and cancels pending search and amount changes', () => {
    visit('search=Ravi&status=unpaid&customerId=c1&minAmount=100&sort=date-asc&page=2');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ search: 'pending', maxAmount: '500' }, true));
    elapse(100);
    act(() => result.current.clear());
    expect(result.current.draft).toEqual(defaultInvoiceListState);
    expect(result.current.filters).toEqual(defaultInvoiceListState);
    expect(window.location.pathname + window.location.search).toBe('/invoices');
    elapse(1000);
    expect(result.current.filters).toEqual(defaultInvoiceListState);
    expect(window.location.search).toBe('');
  });

  it('restores browser navigation and discards a pending edit from the previous URL', () => {
    visit('search=Ravi&status=unpaid&page=4');
    const { result } = renderHook(useInvoiceListFilters);
    act(() => result.current.change({ search: 'pending' }, true));
    elapse(100);
    act(() => {
      visit('search=older&status=paid&minAmount=0&page=2');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.filters).toMatchObject({ search: 'older', status: 'paid', minAmount: '0', page: 2 });
    expect(result.current.draft).toEqual(result.current.filters);
    elapse(1000);
    expect(result.current.filters).toMatchObject({ search: 'older', status: 'paid', minAmount: '0', page: 2 });
    expect(new URLSearchParams(window.location.search).get('search')).toBe('older');
  });
});
