/** All supplier calculations round through integer paise. No forecast enters these rules. */
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const paise = (value: number) => Math.round(value * 100);

export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface BillForPayment {
  id: string;
  amount: number;
  pendingAmount: number;
  paidAmount: number;
  discountReceived: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  cashDiscountPercentage?: number;
  cashDiscountLastDate?: string;
  partialPaymentAllowed?: boolean;
  reservedAmount?: number;
  reservationId?: string;
  reservationStatus?: string;
  reservationExpiresAt?: string;
  recommendedPaymentDate?: string;
  recommendationReason?: string;
}

export interface SupplierForPayment {
  id: string;
  name: string;
  totalDue: number;
  previousBalance: number;
  creditLimit: number | null;
  criticality: 'normal' | 'important' | 'business_stopping';
  partialPaymentAllowed: boolean;
  bills: BillForPayment[];
  previousBalanceReservation?: { id: string; amount: number; status: string; expiresAt: string; recommendedPaymentDate?: string; reason?: string };
}

export function eligibleDiscount(bill: BillForPayment, date: string): number {
  if (!bill.cashDiscountPercentage || !bill.cashDiscountLastDate || date > bill.cashDiscountLastDate || date < bill.invoiceDate || bill.discountReceived > 0) return 0;
  // A discount cannot create a negative cash payment after earlier partial payments.
  const discount = money(bill.amount * bill.cashDiscountPercentage / 100);
  return discount > 0 && discount < bill.pendingAmount ? discount : 0;
}

export function activeReservation(status: string | undefined, expiresAt: string | undefined, now: Date): boolean {
  return status === 'active' && Boolean(expiresAt) && new Date(expiresAt!).getTime() > now.getTime();
}

export interface PaymentRecommendation {
  targetType: 'bill' | 'previous_balance';
  supplierId: string;
  supplierName: string;
  billTransactionId?: string;
  invoiceNumber?: string;
  recommendedAmount: number;
  discountAmount: number;
  paymentDate: string;
  reasonCode: string;
  explanation: string;
  balanceAfterPayment: number;
}

export function recommendSupplierPayments(suppliers: SupplierForPayment[], availableAmount: number, now = new Date()): PaymentRecommendation[] {
  const today = indiaDate(now);
  const soon = indiaDate(new Date(now.getTime() + 3 * 86400000));
  const candidates: Array<{ supplier: SupplierForPayment; bill?: BillForPayment; pending: number; priority: number; reasonCode: string; explanation: string; date: string }> = [];
  for (const supplier of suppliers) {
    const locked = supplier.creditLimit !== null && supplier.totalDue >= supplier.creditLimit;
    const classify = (bill?: BillForPayment) => {
      if (locked && supplier.criticality === 'business_stopping') return [0, 'critical_credit_limit', 'Business-stopping supplier has reached its credit limit.'] as const;
      if (bill && bill.dueDate < today) return [1, 'overdue', `Invoice was due on ${bill.dueDate}.`] as const;
      if (bill && bill.dueDate <= today) return [2, 'due_today', 'Invoice payment is due today.'] as const;
      if (supplier.criticality === 'important') {
        if (supplier.creditLimit !== null && supplier.totalDue >= supplier.creditLimit * 0.9) return [3, 'important_credit_limit', 'Important supplier is at or above 90% of its credit limit.'] as const;
        return [3, 'important_supplier', 'Supplier is marked important to the business.'] as const;
      }
      if (bill && bill.cashDiscountLastDate && bill.cashDiscountLastDate <= soon && eligibleDiscount(bill, today) > 0) return [4, 'discount_expiring', `Full settlement by ${bill.cashDiscountLastDate} qualifies for a cash discount.`] as const;
      return [5, 'upcoming_payment', bill ? `Payment is due on ${bill.dueDate}; money is available now.` : 'Previous supplier balance has no recorded bill deadline.'] as const;
    };
    for (const bill of supplier.bills) {
      if (bill.pendingAmount <= 0 || activeReservation(bill.reservationStatus, bill.reservationExpiresAt, now)) continue;
      const [priority, reasonCode, explanation] = classify(bill);
      candidates.push({ supplier, bill, pending: bill.pendingAmount, priority, reasonCode, explanation, date: bill.dueDate });
    }
    const reserve = supplier.previousBalanceReservation;
    if (supplier.previousBalance > 0 && !activeReservation(reserve?.status, reserve?.expiresAt, now)) {
      const [priority, reasonCode, explanation] = classify();
      candidates.push({ supplier, pending: supplier.previousBalance, priority, reasonCode, explanation, date: '9999-12-31' });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date) || a.supplier.id.localeCompare(b.supplier.id) || (a.bill?.id ?? '').localeCompare(b.bill?.id ?? ''));
  let remaining = Math.max(0, paise(availableAmount));
  const result: PaymentRecommendation[] = [];
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const { supplier, bill } = candidate;
    // Urgent balances are payable now. A normal bill is scheduled from its
    // recorded terms instead of pretending it should be paid today.
    const paymentDate = candidate.reasonCode === 'discount_expiring'
      ? bill?.cashDiscountLastDate ?? today
      : candidate.reasonCode === 'upcoming_payment' && bill
        ? bill.dueDate
        : today;
    // Evaluate the discount on the recommended payment date. A discount that
    // exists today must not be promised for a later due date after it expires.
    const discount = bill ? eligibleDiscount(bill, paymentDate) : 0;
    const fullCash = paise(candidate.pending - discount);
    const canPayFull = remaining >= fullCash;
    const allowsPartial = supplier.partialPaymentAllowed && (bill?.partialPaymentAllowed ?? true);
    if (!canPayFull && (!allowsPartial || candidate.reasonCode === 'discount_expiring')) continue;
    const amount = canPayFull ? fullCash : Math.min(remaining, paise(candidate.pending));
    if (amount <= 0) continue;
    remaining -= amount;
    result.push({ targetType: bill ? 'bill' : 'previous_balance', supplierId: supplier.id, supplierName: supplier.name,
      billTransactionId: bill?.id, invoiceNumber: bill?.invoiceNumber, recommendedAmount: amount / 100,
      discountAmount: canPayFull ? discount : 0, paymentDate, reasonCode: candidate.reasonCode,
      explanation: candidate.explanation
        + (paymentDate > today ? ` Recommended payment date: ${paymentDate}.` : '')
        + (!canPayFull ? ' Available money covers a partial payment.' : ''),
      balanceAfterPayment: remaining / 100 });
  }
  return result;
}
