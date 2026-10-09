'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  defaultInvoiceListState, invoiceFilterErrors, invoiceListUrl,
  readInvoiceListState, type InvoiceListState,
} from '@/lib/invoice-list-state';

export function useInvoiceListFilters() {
  const location = useSearchParams().toString();
  const [state, setState] = useState(() => {
    const initial = readInvoiceListState(new URLSearchParams(location));
    return { location, draft: initial, committed: initial };
  });

  // Restore drafts as well as results on back/forward navigation.
  useEffect(() => {
    setState((current) => {
      if (current.location === location) return current;
      const restored = readInvoiceListState(new URLSearchParams(location));
      return { location, draft: restored, committed: restored };
    });
  }, [location]);

  const commit = useCallback((draft: InvoiceListState, committed: InvoiceListState) => {
    const url = invoiceListUrl(committed);
    window.history.replaceState(null, '', url);
    setState({ draft, committed, location: url.split('?')[1] || '' });
  }, []);

  const change = (patch: Partial<InvoiceListState>, debounce = false) => {
    const draft = { ...state.draft, ...patch, page: 1 };
    if (debounce) {
      setState({ ...state, draft });
      return;
    }
    const next = { ...state.committed, ...patch, page: 1 };
    if ('startDate' in patch || 'endDate' in patch) {
      next.startDate = draft.startDate;
      next.endDate = draft.endDate;
    }
    if (invoiceFilterErrors(next).date || invoiceFilterErrors(next).amount) {
      setState({ ...state, draft });
      return;
    }
    commit(draft, next);
  };

  useEffect(() => {
    const search = state.draft.search.trim().length >= 2 ? state.draft.search.trim() : '';
    const amountValid = !invoiceFilterErrors(state.draft).amount;
    const minAmount = amountValid ? state.draft.minAmount : state.committed.minAmount;
    const maxAmount = amountValid ? state.draft.maxAmount : state.committed.maxAmount;
    if (search === state.committed.search && minAmount === state.committed.minAmount && maxAmount === state.committed.maxAmount) return;
    const timer = window.setTimeout(() => {
      commit(state.draft, { ...state.committed, search, minAmount, maxAmount, page: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state, commit]);

  const clear = () => commit(defaultInvoiceListState, defaultInvoiceListState);
  const setPage = (page: number) => commit({ ...state.draft, page }, { ...state.committed, page });
  return { draft: state.draft, filters: state.committed, change, clear, setPage };
}
