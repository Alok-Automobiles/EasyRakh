import type { CreateIndexesOptions, Db, IndexSpecification } from 'mongodb';

export interface SupplierPaymentIndex {
  collection: 'transactions' | 'suppliers' | 'businessBalanceAdjustments';
  key: IndexSpecification;
  options: CreateIndexesOptions & { name: string };
}

// Additive only. In particular, do not add uniqueness to historical invoices
// that have not been promoted to tracked bills.
export const SUPPLIER_PAYMENTS_INDEXES: SupplierPaymentIndex[] = [
  {
    collection: 'transactions',
    key: { userId: 1, entityId: 1, invoiceNumber: 1 },
    options: {
      name: 'supplier_tracked_invoice_unique',
      unique: true,
      partialFilterExpression: {
        entityType: 'supplier', type: 'credit',
        billStatus: { $exists: true }, invoiceNumber: { $type: 'string' },
      },
    },
  },
  {
    collection: 'transactions',
    key: { userId: 1, supplierPaymentRequestId: 1 },
    options: {
      name: 'supplier_payment_request_unique', unique: true,
      partialFilterExpression: { supplierPaymentRequestId: { $type: 'string' } },
    },
  },
  {
    collection: 'transactions',
    key: { userId: 1, entityType: 1, billStatus: 1, dueDate: 1 },
    options: { name: 'supplier_bill_due' },
  },
  {
    collection: 'transactions',
    key: { userId: 1, reservationStatus: 1, reservationExpiresAt: 1 },
    options: { name: 'supplier_bill_reservations' },
  },
  {
    collection: 'transactions',
    key: { userId: 1, 'paymentAllocations.billTransactionId': 1 },
    options: { name: 'supplier_payment_allocations' },
  },
  {
    collection: 'suppliers',
    key: { userId: 1, 'previousBalanceReservation.status': 1, 'previousBalanceReservation.expiresAt': 1 },
    options: { name: 'supplier_previous_reservations' },
  },
  {
    collection: 'businessBalanceAdjustments',
    key: { userId: 1, date: -1 },
    options: { name: 'business_cash_adjustment_history' },
  },
  {
    collection: 'businessBalanceAdjustments',
    key: { userId: 1, idempotencyKey: 1 },
    options: {
      name: 'business_cash_adjustment_request_unique', unique: true,
      partialFilterExpression: { idempotencyKey: { $type: 'string' } },
    },
  },
];

export async function ensureSupplierPaymentIndexes(db: Db): Promise<void> {
  // Await and propagate failures: uniqueness is a correctness requirement.
  for (const spec of SUPPLIER_PAYMENTS_INDEXES) {
    await db.collection(spec.collection).createIndex(spec.key, spec.options);
  }
}
