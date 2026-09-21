import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SupplierBillFields, SupplierPaymentFields, allocationCashTotal, allocationPayload, defaultSupplierBill, emptyAllocation } from '@/components/SupplierPaymentFields';
import { SupplierPaymentView } from '@/lib/hooks/useSupplierPayments';

const supplier: SupplierPaymentView = { id: 'supplier-1', name: 'ABC Traders', totalDue: 55000, previousBalance: 5000, creditLimit: 100000, criticality: 'normal', partialPaymentAllowed: true, bills: [{ id: 'bill-1', amount: 50000, invoiceNumber: 'ABC-1045', invoiceDate: '2026-09-01', dueDate: '2026-09-30', cashDiscountPercentage: 2.5, cashDiscountLastDate: '2026-09-07', paidAmount: 0, discountReceived: 0, pendingAmount: 50000, reservedAmount: 0, billStatus: 'unpaid' }] };

function PaymentHarness({ value = supplier, date = '2026-09-07' }: { value?: SupplierPaymentView; date?: string }) {
  const [allocation, setAllocation] = useState(emptyAllocation);
  return <><SupplierPaymentFields supplier={value} value={allocation} onChange={setAllocation} date={date} /><output data-testid="cash-total">{allocationCashTotal(allocation)}</output><output data-testid="allocation">{JSON.stringify(allocationPayload(allocation))}</output></>;
}

describe('Supplier payment form', () => {
  it('keeps cash distinct from full settlement when a discount is accepted', async () => {
    const user = userEvent.setup();
    render(<PaymentHarness />);
    await user.click(screen.getByRole('button', { name: 'Settle with 2.5% CD' }));
    expect(screen.getByTestId('cash-total')).toHaveTextContent('48750');
    expect(JSON.parse(screen.getByTestId('allocation').textContent!)).toEqual({ paymentAllocations: [{ billTransactionId: 'bill-1', cashAmount: 48750, discountAmount: 1250 }], previousBalanceCashAmount: 0 });
  });

  it('allocates partial cash and Previous Balance without inventing a discount', () => {
    render(<PaymentHarness />);
    fireEvent.change(screen.getByLabelText('Cash paid (₹)'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText(/Previous Balance/), { target: { value: '2500' } });
    expect(screen.getByTestId('cash-total')).toHaveTextContent('22500');
    expect(JSON.parse(screen.getByTestId('allocation').textContent!)).toEqual({ paymentAllocations: [{ billTransactionId: 'bill-1', cashAmount: 20000, discountAmount: 0 }], previousBalanceCashAmount: 2500 });
  });

  it('does not offer an expired discount or a discount larger than remaining dues', () => {
    const { rerender } = render(<PaymentHarness date="2026-09-08" />);
    expect(screen.queryByRole('button', { name: /Settle with/ })).not.toBeInTheDocument();
    rerender(<PaymentHarness value={{ ...supplier, bills: [{ ...supplier.bills[0], pendingAmount: 1000, paidAmount: 49000 }] }} />);
    expect(screen.queryByRole('button', { name: /Settle with/ })).not.toBeInTheDocument();
  });

  it('requires invoice terms and a deadline when a cash discount is entered', async () => {
    const save = vi.fn((event: React.FormEvent) => event.preventDefault());
    function BillHarness() {
      const [bill, setBill] = useState(() => defaultSupplierBill('2026-09-01'));
      return <form onSubmit={save}><SupplierBillFields value={bill} onChange={setBill} /><button type="submit">Save bill</button></form>;
    }
    const user = userEvent.setup();
    render(<BillHarness />);
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Supplier invoice number *'), { target: { value: 'ABC-1045' } });
    fireEvent.change(screen.getByLabelText('Payment due date *'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Cash discount (%)'), { target: { value: '2.5' } });
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Discount deadline'), { target: { value: '2026-09-07' } });
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(save).toHaveBeenCalledOnce();
  });
});
