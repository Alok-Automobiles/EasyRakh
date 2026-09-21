'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SupplierPaymentView, businessToday, formatMoney, displayPaymentDate } from '@/lib/hooks/useSupplierPayments';

export interface AllocationDraft {
  bills: Record<string, { cash: string; discount: string }>;
  previous: string;
}

export const emptyAllocation = (): AllocationDraft => ({ bills: {}, previous: '' });

export function allocationPayload(value: AllocationDraft) {
  return {
    paymentAllocations: Object.entries(value.bills)
      .filter(([, row]) => Number(row.cash) > 0 || Number(row.discount) > 0)
      .map(([billTransactionId, row]) => ({ billTransactionId, cashAmount: Number(row.cash) || 0, discountAmount: Number(row.discount) || 0 })),
    previousBalanceCashAmount: Number(value.previous) || 0,
  };
}

export function allocationCashTotal(value: AllocationDraft) {
  return Math.round((Object.values(value.bills).reduce((sum, row) => sum + (Number(row.cash) || 0), 0) + (Number(value.previous) || 0)) * 100) / 100;
}

export function SupplierPaymentFields({ supplier, value, onChange, date }: {
  supplier: SupplierPaymentView;
  value: AllocationDraft;
  onChange: (value: AllocationDraft) => void;
  date: string;
}) {
  const setRow = (id: string, field: 'cash' | 'discount', amount: string) => onChange({
    ...value, bills: { ...value.bills, [id]: { ...(value.bills[id] ?? { cash: '', discount: '' }), [field]: amount } },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Connect the money paid to bills below. A cash discount can only be recorded when the complete remaining bill is settled by its discount deadline.</p>
      {supplier.bills.filter((bill) => bill.pendingAmount > 0).map((bill) => {
        const discount = Math.round(bill.amount * (bill.cashDiscountPercentage ?? 0)) / 100;
        const canDiscount = discount > 0 && discount < bill.pendingAmount && !!bill.cashDiscountLastDate && date <= bill.cashDiscountLastDate.slice(0, 10) && date >= bill.invoiceDate.slice(0, 10) && !bill.discountReceived;
        return (
          <div className="rounded-lg border border-border p-3 space-y-3" key={bill.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-sm font-medium">{bill.invoiceNumber}</p><p className="text-xs text-muted-foreground">Due {displayPaymentDate(bill.dueDate)} · Pending {formatMoney(bill.pendingAmount)}</p></div>
              {canDiscount && <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, bills: { ...value.bills, [bill.id]: { cash: (Math.round((bill.pendingAmount - discount) * 100) / 100).toString(), discount: discount.toString() } } })}>Settle with {bill.cashDiscountPercentage}% CD</Button>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor={`cash-${bill.id}`}>Cash paid (₹)</Label><Input id={`cash-${bill.id}`} type="number" inputMode="decimal" min="0" max={bill.pendingAmount} step="0.01" value={value.bills[bill.id]?.cash ?? ''} placeholder="0.00" onChange={(e) => setRow(bill.id, 'cash', e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor={`discount-${bill.id}`}>Discount received (₹)</Label><Input id={`discount-${bill.id}`} type="number" inputMode="decimal" min="0" max={bill.pendingAmount} step="0.01" value={value.bills[bill.id]?.discount ?? ''} placeholder="0.00" onChange={(e) => setRow(bill.id, 'discount', e.target.value)} /></div>
            </div>
            {bill.cashDiscountLastDate && <p className="text-xs text-muted-foreground">{bill.cashDiscountPercentage}% CD until {displayPaymentDate(bill.cashDiscountLastDate)}. Confirm the discount was accepted by the supplier.</p>}
          </div>
        );
      })}
      {supplier.previousBalance > 0 && <div className="rounded-lg border border-border p-3 space-y-2"><Label htmlFor="previous-balance-paid">Previous Balance — {formatMoney(supplier.previousBalance)}</Label><p className="text-xs text-muted-foreground">Older dues without individual bill details.</p><Input id="previous-balance-paid" type="number" inputMode="decimal" min="0" max={supplier.previousBalance} step="0.01" placeholder="Cash paid (₹)" value={value.previous} onChange={(e) => onChange({ ...value, previous: e.target.value })} /></div>}
      {supplier.totalDue <= 0 && <p className="text-sm text-muted-foreground">This supplier has no amount due.</p>}
      <p className="text-sm font-medium">Actual money paid: {formatMoney(allocationCashTotal(value))}</p>
    </div>
  );
}

export interface SupplierTermsDraft {
  creditLimit: string;
  criticality: 'normal' | 'important' | 'business_stopping';
  partialPaymentAllowed: boolean;
}

export const defaultSupplierTerms = (): SupplierTermsDraft => ({ creditLimit: '', criticality: 'normal', partialPaymentAllowed: true });

export function SupplierTermsFields({ value, onChange }: { value: SupplierTermsDraft; onChange: (value: SupplierTermsDraft) => void }) {
  return <fieldset className="space-y-3 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-medium">Payment terms</legend>
    <div className="space-y-1"><Label htmlFor="supplier-credit-limit">Supplier credit limit (₹)</Label><Input id="supplier-credit-limit" type="number" inputMode="decimal" min="0" step="0.01" value={value.creditLimit} onChange={(e) => onChange({ ...value, creditLimit: e.target.value })} placeholder="Leave blank if unknown" /><p className="text-xs text-muted-foreground">Total dues allowed before the supplier stops further credit.</p></div>
    <div className="space-y-1"><Label htmlFor="supplier-criticality">Impact if supply stops</Label><select id="supplier-criticality" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.criticality} onChange={(e) => onChange({ ...value, criticality: e.target.value as SupplierTermsDraft['criticality'] })}><option value="normal">Normal</option><option value="important">Important</option><option value="business_stopping">Business-stopping</option></select></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.partialPaymentAllowed} onChange={(e) => onChange({ ...value, partialPaymentAllowed: e.target.checked })} />Supplier accepts partial payments</label>
  </fieldset>;
}

export interface SupplierBillDraft {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  cashDiscountPercentage: string;
  cashDiscountLastDate: string;
  partialPaymentAllowed: boolean;
}

export function defaultSupplierBill(date: string): SupplierBillDraft {
  return { invoiceNumber: '', invoiceDate: date, dueDate: '', cashDiscountPercentage: '', cashDiscountLastDate: '', partialPaymentAllowed: true };
}

export function supplierBillPayload(value: SupplierBillDraft) {
  return { ...value, invoiceNumber: value.invoiceNumber.trim(), cashDiscountPercentage: Number(value.cashDiscountPercentage) || 0, cashDiscountLastDate: value.cashDiscountLastDate || undefined, cashDiscountRequiresFullPayment: true };
}

export function SupplierBillFields({ value, onChange }: { value: SupplierBillDraft; onChange: (value: SupplierBillDraft) => void }) {
  return <fieldset className="space-y-4 rounded-xl border border-border bg-card p-5"><legend className="px-1 font-semibold">Supplier bill details</legend>
    <p className="text-sm text-muted-foreground">Use the supplier’s invoice and agreed payment terms. This purchase increases dues; money moves only when you pay.</p>
    <div className="space-y-1"><Label htmlFor="supplier-invoice-number">Supplier invoice number *</Label><Input id="supplier-invoice-number" required maxLength={100} value={value.invoiceNumber} onChange={(e) => onChange({ ...value, invoiceNumber: e.target.value })} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="supplier-invoice-date">Invoice date *</Label><Input id="supplier-invoice-date" required type="date" max={businessToday()} value={value.invoiceDate} onChange={(e) => onChange({ ...value, invoiceDate: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="supplier-due-date">Payment due date *</Label><Input id="supplier-due-date" required type="date" min={value.invoiceDate} value={value.dueDate} onChange={(e) => onChange({ ...value, dueDate: e.target.value })} /></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="supplier-cd-percentage">Cash discount (%)</Label><Input id="supplier-cd-percentage" type="number" inputMode="decimal" min="0" max="99.99" step="0.01" placeholder="For example, 2.5" value={value.cashDiscountPercentage} onChange={(e) => onChange({ ...value, cashDiscountPercentage: e.target.value })} /></div><div className="space-y-1"><Label htmlFor="supplier-cd-date">Discount deadline</Label><Input id="supplier-cd-date" type="date" min={value.invoiceDate} required={Number(value.cashDiscountPercentage) > 0} value={value.cashDiscountLastDate} onChange={(e) => onChange({ ...value, cashDiscountLastDate: e.target.value })} /></div></div>
    <p className="text-xs text-muted-foreground">Discount applies only when the full remaining invoice is settled within the deadline.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.partialPaymentAllowed} onChange={(e) => onChange({ ...value, partialPaymentAllowed: e.target.checked })} />Partial payment allowed for this bill</label>
  </fieldset>;
}
