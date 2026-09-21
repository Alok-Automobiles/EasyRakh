import { describe, expect, it } from 'vitest';
import { activeReservation, BillForPayment, eligibleDiscount, indiaDate, recommendSupplierPayments, SupplierForPayment } from '@/lib/supplier-payments-rules';

const now = new Date('2026-09-12T10:00:00Z');
const bill = (overrides: Partial<BillForPayment> = {}): BillForPayment => ({ id: 'bill-1', invoiceNumber: 'INV-1', amount: 50000, pendingAmount: 50000, paidAmount: 0, discountReceived: 0, invoiceDate: '2026-09-01', dueDate: '2026-09-30', partialPaymentAllowed: true, ...overrides });
const supplier = (overrides: Partial<SupplierForPayment> = {}): SupplierForPayment => ({ id: 'supplier-1', name: 'Parts supplier', totalDue: 50000, previousBalance: 0, creditLimit: null, criticality: 'normal', partialPaymentAllowed: true, bills: [bill()], ...overrides });

describe('supplier payment rules', () => {
  it('uses the India calendar across the UTC day boundary', () => {
    expect(indiaDate(new Date('2026-09-11T19:00:00Z'))).toBe('2026-09-12');
  });

  it('qualifies full settlement for the original invoice discount after earlier partial payments', () => {
    const partial = bill({ pendingAmount: 30000, paidAmount: 20000, cashDiscountPercentage: 2.5, cashDiscountLastDate: '2026-09-12' });
    expect(eligibleDiscount(partial, '2026-09-12')).toBe(1250);
    const [result] = recommendSupplierPayments([supplier({ totalDue: 30000, bills: [partial] })], 28750, now);
    expect(result).toMatchObject({ recommendedAmount: 28750, discountAmount: 1250, reasonCode: 'discount_expiring', balanceAfterPayment: 0 });
  });

  it('does not promise expired discounts or negative final cash', () => {
    expect(eligibleDiscount(bill({ cashDiscountPercentage: 2.5, cashDiscountLastDate: '2026-09-11' }), '2026-09-12')).toBe(0);
    expect(eligibleDiscount(bill({ pendingAmount: 1000, paidAmount: 49000, cashDiscountPercentage: 2.5, cashDiscountLastDate: '2026-09-12' }), '2026-09-12')).toBe(0);
    expect(eligibleDiscount(bill({ discountReceived: 1250, cashDiscountPercentage: 2.5, cashDiscountLastDate: '2026-09-12' }), '2026-09-12')).toBe(0);
  });

  it('prioritizes a locked business-stopping supplier before overdue and discounts', () => {
    const critical = supplier({ id: 'critical', criticality: 'business_stopping', creditLimit: 50000 });
    const overdue = supplier({ id: 'overdue', bills: [bill({ dueDate: '2026-09-10' })] });
    const discount = supplier({ id: 'discount', bills: [bill({ cashDiscountPercentage: 5, cashDiscountLastDate: '2026-09-13' })] });
    const results = recommendSupplierPayments([discount, overdue, critical], 70000, now);
    expect(results.map(r => [r.supplierId, r.recommendedAmount])).toEqual([['critical', 50000], ['overdue', 20000]]);
    expect(results.reduce((sum, r) => sum + r.recommendedAmount, 0)).toBe(70000);
  });

  it('prioritizes every important supplier before a normal supplier even without a credit limit', () => {
    const important = supplier({ id: 'z-important', criticality: 'important' });
    const normal = supplier({ id: 'a-normal' });
    const [result] = recommendSupplierPayments([normal, important], 50000, now);
    expect(result).toMatchObject({ supplierId: 'z-important', reasonCode: 'important_supplier' });
  });

  it('never treats an unaffordable partial payment as capturing a full-settlement discount', () => {
    const discount = supplier({ bills: [bill({ cashDiscountPercentage: 5, cashDiscountLastDate: '2026-09-13' })] });
    expect(recommendSupplierPayments([discount], 47000, now)).toEqual([]);
  });

  it('schedules a normal bill for its due date and does not promise a discount that expires earlier', () => {
    const normal = supplier({ bills: [bill({ cashDiscountPercentage: 2.5, cashDiscountLastDate: '2026-09-20', dueDate: '2026-09-30' })] });
    const [result] = recommendSupplierPayments([normal], 50000, now);
    expect(result).toMatchObject({ paymentDate: '2026-09-30', recommendedAmount: 50000, discountAmount: 0, reasonCode: 'upcoming_payment' });
  });

  it('honors both supplier and bill prohibitions on partial payment', () => {
    expect(recommendSupplierPayments([supplier({ partialPaymentAllowed: false })], 20000, now)).toEqual([]);
    expect(recommendSupplierPayments([supplier({ bills: [bill({ partialPaymentAllowed: false })] })], 20000, now)).toEqual([]);
  });

  it('skips active reservations but considers expired balances again', () => {
    const reservedBill = bill({ reservationStatus: 'active', reservedAmount: 20000, reservationExpiresAt: '2026-09-13T00:00:00Z' });
    expect(recommendSupplierPayments([supplier({ bills: [reservedBill] })], 40000, now)).toEqual([]);
    reservedBill.reservationExpiresAt = '2026-09-12T09:00:00Z';
    expect(recommendSupplierPayments([supplier({ bills: [reservedBill] })], 40000, now)[0]?.recommendedAmount).toBe(40000);
    expect(activeReservation('active', now.toISOString(), now)).toBe(false);
  });

  it('offers Previous Balance without inventing an invoice deadline', () => {
    const [result] = recommendSupplierPayments([supplier({ bills: [], previousBalance: 1234.56, totalDue: 1234.56 })], 1000.15, now);
    expect(result).toMatchObject({ targetType: 'previous_balance', recommendedAmount: 1000.15, discountAmount: 0, paymentDate: '2026-09-12' });
    expect(result.explanation).toContain('no recorded bill deadline');
  });

  it('does not spend negative or zero availability', () => {
    expect(recommendSupplierPayments([supplier()], -100, now)).toEqual([]);
    expect(recommendSupplierPayments([supplier()], 0, now)).toEqual([]);
  });

  it('allocates decimal money without creating or overspending paise', () => {
    const suppliers = [supplier({ id: 'a', bills: [bill({ amount: 0.1, pendingAmount: 0.1 })] }), supplier({ id: 'b', bills: [bill({ amount: 0.2, pendingAmount: 0.2 })] })];
    expect(recommendSupplierPayments(suppliers, 0.3, now).map(r => r.recommendedAmount)).toEqual([0.1, 0.2]);
    expect(recommendSupplierPayments(suppliers, 0.3, now).at(-1)?.balanceAfterPayment).toBe(0);
  });
});
