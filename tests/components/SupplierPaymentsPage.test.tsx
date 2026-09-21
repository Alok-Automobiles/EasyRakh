import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupplierPaymentsPage from '@/app/supplier-payments/page';
import { BusinessCashView, SupplierPaymentsView } from '@/lib/hooks/useSupplierPayments';

const mocks = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), business: vi.fn(), payments: vi.fn() }));
vi.mock('@/lib/hooks/useSupplierPayments', async (importOriginal) => ({ ...await importOriginal<object>(), supplierRequest: mocks.request, useBusinessCash: mocks.business, useSupplierPayments: mocks.payments, useRefreshSupplierPayments: () => mocks.refresh }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
const cash: BusinessCashView = { currentBalance: 100000, protectedAmount: 30000, version: 4, anchorVersion: 1, needsReconciliation: false };
function snapshot(): SupplierPaymentsView {
  return { businessCash: { ...cash }, summary: { currentBalance: 100000, protectedAmount: 30000, reservedAmount: 0, availableAmount: 70000, dailySupplierPayments: 0 }, version: 4, issues: [], suppliers: [{ id: 'supplier-1', name: 'ABC Traders', totalDue: 50000, previousBalance: 0, creditLimit: 100000, criticality: 'normal', partialPaymentAllowed: true, bills: [{ id: 'bill-1', amount: 50000, invoiceNumber: 'ABC-1045', invoiceDate: '2026-09-01', dueDate: '2026-09-30', paidAmount: 0, discountReceived: 0, pendingAmount: 50000, reservedAmount: 0, billStatus: 'unpaid' }] }], recommendations: [{ supplierId: 'supplier-1', billTransactionId: 'bill-1', targetType: 'bill', recommendedAmount: 20000, paymentDate: '2026-09-12', reasonCode: 'overdue', explanation: 'Invoice is overdue.', balanceAfterPayment: 50000 }] };
}
let current: SupplierPaymentsView;

beforeEach(() => {
  vi.clearAllMocks();
  current = snapshot();
  mocks.business.mockImplementation(() => ({ data: { enabled: true, businessCash: current.businessCash }, isPending: false, isError: false }));
  mocks.payments.mockImplementation(() => ({ data: current, isPending: false, isError: false, isFetching: false }));
  mocks.request.mockResolvedValue({});
  mocks.refresh.mockResolvedValue(undefined);
});

describe('Supplier Payments page', () => {
  it('hides feature actions when disabled', () => {
    mocks.business.mockReturnValue({ data: { enabled: false, businessCash: null }, isPending: false, isError: false });
    render(<SupplierPaymentsPage />);
    expect(screen.getByText('Supplier payment recommendations are currently unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve money' })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('reserves a recommendation without recording a payment', async () => {
    const user = userEvent.setup();
    render(<SupplierPaymentsPage />);
    await user.click(screen.getByRole('button', { name: 'Reserve money' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    expect(mocks.request.mock.calls[0][0]).toBe('/api/supplier-payments/reserve');
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toMatchObject({ supplierId: 'supplier-1', billTransactionId: 'bill-1', amount: 20000, recommendationReason: 'Invoice is overdue.', expectedVersion: 4 });
    expect(screen.getByText(/EasyRakh shows ₹1,00,000/)).toBeInTheDocument();
  });

  it('opens a reservation for confirmation and only records cash after submission', async () => {
    current.suppliers[0].bills[0] = { ...current.suppliers[0].bills[0], reservedAmount: 20000, reservationId: 'reservation-1', reservationStatus: 'active', reservationExpiresAt: '2099-01-01T00:00:00Z', recommendedPaymentDate: '2026-09-12' };
    current.recommendations = [];
    const user = userEvent.setup();
    render(<SupplierPaymentsPage />);
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    expect(mocks.request).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Record ₹20,000.00 paid' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    expect(mocks.request.mock.calls[0][0]).toBe('/api/supplier-payments/pay');
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toMatchObject({ paymentAllocations: [{ billTransactionId: 'bill-1', cashAmount: 20000, discountAmount: 0 }], reservationId: 'reservation-1' });
  });

  it('prefills the earned discount when a discounted reservation is marked paid', async () => {
    current.suppliers[0].bills[0] = {
      ...current.suppliers[0].bills[0], cashDiscountPercentage: 2.5, cashDiscountLastDate: '2099-01-01',
      reservedAmount: 48750, reservationId: 'discount-reservation', reservationStatus: 'active',
      reservationExpiresAt: '2099-01-02T00:00:00Z', recommendedPaymentDate: '2099-01-01',
    };
    current.recommendations = [];
    const user = userEvent.setup();
    render(<SupplierPaymentsPage />);
    await user.click(screen.getByRole('button', { name: 'Mark as paid' }));
    await user.click(screen.getByRole('button', { name: 'Record ₹48,750.00 paid' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toMatchObject({
      paymentAllocations: [{ billTransactionId: 'bill-1', cashAmount: 48750, discountAmount: 1250 }],
      reservationId: 'discount-reservation',
    });
  });

  it('shows auditable cash and liability amounts for discounted payment history', () => {
    current.payments = [{
      id: 'payment-1', entityId: 'supplier-1', date: '2026-09-12T00:00:00.000Z',
      amount: 50000, cashPaidAmount: 48750, cashDiscountAmount: 1250, description: 'Paid with CD',
    }];
    render(<SupplierPaymentsPage />);
    expect(screen.getByRole('heading', { name: 'Recent supplier payments' })).toBeInTheDocument();
    expect(screen.getByText('Cash paid ₹48,750.00')).toBeInTheDocument();
    expect(screen.getByText('Dues reduced ₹50,000.00')).toBeInTheDocument();
  });

  it('keeps the request key after a lost response and a balance version refresh', async () => {
    mocks.request.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({});
    mocks.refresh.mockImplementation(async () => { current.version = 5; current.businessCash!.version = 5; });
    const user = userEvent.setup();
    render(<SupplierPaymentsPage />);
    await user.click(screen.getByRole('button', { name: 'Reserve money' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reserve money' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Reserve money' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    const first = JSON.parse(mocks.request.mock.calls[0][1].body);
    const retry = JSON.parse(mocks.request.mock.calls[1][1].body);
    expect(first.requestId).toBe(retry.requestId);
    expect(first.expectedVersion).toBe(4);
    expect(retry.expectedVersion).toBe(5);
  });

  it('treats a completed mutation as successful even if the following refresh fails', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('Offline during refresh'));
    const user = userEvent.setup();
    render(<SupplierPaymentsPage />);
    await user.click(screen.getByRole('button', { name: 'Reserve money' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Reserve money' })).toBeEnabled();
  });

  it('prevents double submissions while a reserve request is pending', async () => {
    mocks.request.mockImplementation(() => new Promise(() => {}));
    render(<SupplierPaymentsPage />);
    const button = screen.getByRole('button', { name: 'Reserve money' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it('pauses payment actions while the business balance needs confirmation', () => {
    current.businessCash!.needsReconciliation = true;
    render(<SupplierPaymentsPage />);
    expect(screen.getByRole('button', { name: 'Reserve money' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm balance' })).toBeEnabled();
  });
});
