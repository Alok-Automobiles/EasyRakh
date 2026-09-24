import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LedgerPage from '@/app/ledger/[entityType]/[entityId]/page';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn(), business: vi.fn(), payments: vi.fn(), print: vi.fn(), router: { push: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ entityType: 'supplier', entityId: 'supplier-1' }), useRouter: () => mocks.router }));
vi.mock('@/lib/hooks/useSupplierPayments', async (importOriginal) => ({ ...await importOriginal<object>(), useBusinessCash: mocks.business, useSupplierPayments: mocks.payments, useRefreshSupplierPayments: () => mocks.refresh }));
vi.mock('@/components/SupplierLedgerPayments', () => ({ default: () => null }));
vi.mock('@/components/PrintLedgerOverlay', () => ({ default: (props: unknown) => { mocks.print(props); return null; } }));
vi.mock('@/components/PdfDocumentViewer', () => ({ default: () => null }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.business.mockReturnValue({ data: { enabled: true, businessCash: { currentBalance: 100000, protectedAmount: 30000, needsReconciliation: true, version: 4, anchorVersion: 1 } } });
  mocks.payments.mockReturnValue({ isFetching: false, data: { version: 4, suppliers: [{ id: 'supplier-1', name: 'ABC Traders', totalDue: 40000, previousBalance: 0, partialPaymentAllowed: true, creditLimit: null, criticality: 'normal', bills: [{ id: 'bill-1', amount: 50000, pendingAmount: 50000, paidAmount: 0, discountReceived: 0, reservedAmount: 0, invoiceNumber: 'ABC-1045', invoiceDate: '2026-09-01', dueDate: '2026-09-30', billStatus: 'unpaid' }] }] } });
  mocks.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
    if (options?.method === 'PUT') return { ok: true, json: async () => ({ transaction: { id: 'payment-1' } }) };
    if (url === '/api/transactions/payment-1') return { ok: true, json: async () => ({ transaction: { id: 'payment-1', entityType: 'supplier', entityId: 'supplier-1', type: 'debit', amount: 10000, date: '2026-09-03', description: 'Payment during feature rollback' } }) };
    return { ok: true, json: async () => ({ entity: { id: 'supplier-1', name: 'ABC Traders', openingBalance: 0, balanceType: 'credit' }, entityType: 'supplier', openingBalance: { amount: 0, type: 'credit' }, entries: [{ transactionId: 'payment-1', date: '2026-09-03', description: 'Payment during feature rollback', debit: 10000, credit: 0, balance: -40000 }], totals: { credit: 50000, debit: 10000, balance: -40000 } }) };
  });
});

describe('Supplier ledger rollback repair', () => {
  it('allocates an existing payment to its bill while retaining its actual cash amount', async () => {
    const user = userEvent.setup();
    render(<LedgerPage />);
    await user.click(await screen.findByTitle('Edit'));
    expect(await screen.findByLabelText('Actual money paid (₹)')).toHaveValue(10000);
    expect(screen.getByText(/Connect this existing payment to its bills/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cash paid (₹)'), { target: { value: '10000' } });
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const [url, request] = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(url).toBe('/api/transactions/payment-1');
    expect(JSON.parse(request.body)).toMatchObject({ amount: 10000, supplierId: 'supplier-1', expectedVersion: 4, paymentAllocations: [{ billTransactionId: 'bill-1', cashAmount: 10000, discountAmount: 0 }], previousBalanceCashAmount: 0 });
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});


describe('Ledger scroll loading', () => {
  it('loads only the first batch until scrolling, retries failed pages, and stops at the end', async () => {
    let intersect: IntersectionObserverCallback;
    window.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    const page = (description: string, hasMore: boolean) => ({
      entity: { id: 'supplier-1', name: 'ABC Traders', openingBalance: 0, balanceType: 'credit' },
      entityType: 'supplier', openingBalance: { amount: 0, type: 'credit' },
      entries: [{ transactionId: description, date: '2026-09-03', description, debit: 100, credit: 0, balance: 100 }],
      totals: { credit: 0, debit: 200, balance: 200 },
      pagination: { hasMore, nextCursor: hasMore ? 'page-two' : undefined },
    });
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => page('First transaction', true) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => page('Second transaction', false) });
    render(<LedgerPage />);
    await screen.findByText('First transaction');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/ledger/supplier/supplier-1?limit=50');
    await act(async () => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await screen.findByRole('button', { name: 'Retry loading transactions' });
    expect(screen.getByText('First transaction')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading transactions' }));
    await screen.findByText('Second transaction');
    expect(screen.getByText('First transaction')).toBeInTheDocument();
    expect(mocks.fetch.mock.calls[2][0]).toBe('/api/ledger/supplier/supplier-1?limit=50&cursor=page-two');
    expect(screen.queryByRole('button', { name: 'Load more transactions' })).not.toBeInTheDocument();
  });
});


it('loads all pages for printing without expanding the on-screen ledger', async () => {
  const page = (description: string, hasMore: boolean) => ({
    entity: { id: 'supplier-1', name: 'ABC Traders', openingBalance: 0, balanceType: 'credit' },
    entityType: 'supplier', openingBalance: { amount: 0, type: 'credit' },
    entries: [{ transactionId: description, date: '2026-09-03', description, debit: 100, credit: 0, balance: 100 }],
    totals: { credit: 0, debit: 200, balance: 200 },
    pagination: { hasMore, nextCursor: hasMore ? 'print-next' : undefined },
  });
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => page('Visible transaction', true) })
    .mockResolvedValueOnce({ ok: true, json: async () => page('Visible transaction', true) })
    .mockResolvedValueOnce({ ok: true, json: async () => page('Unloaded transaction', false) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ user: {} }) });
  render(<LedgerPage />);
  await screen.findByText('Visible transaction');
  await userEvent.click(screen.getByRole('button', { name: 'Print/Download' }));
  await waitFor(() => expect(mocks.print).toHaveBeenLastCalledWith(expect.objectContaining({
    open: true,
    ledgerData: expect.objectContaining({ entries: [expect.objectContaining({ description: 'Visible transaction' }), expect.objectContaining({ description: 'Unloaded transaction' })] }),
  })));
  expect(screen.queryByText('Unloaded transaction')).not.toBeInTheDocument();
  expect(mocks.fetch.mock.calls[2][0]).toBe('/api/ledger/supplier/supplier-1?limit=500&cursor=print-next');
});
