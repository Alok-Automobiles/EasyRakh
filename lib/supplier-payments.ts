import { ClientSession, Db, Document, ObjectId } from 'mongodb';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyBusinessCashDelta, assertBusinessCashReady, BusinessCashError, readBusinessCash, withBusinessCashTransaction } from './business-cash';
import { supplierPaymentsEnabled } from './supplier-payment-settings';
import { activeReservation, BillForPayment, eligibleDiscount, indiaDate, money, paise, recommendSupplierPayments, SupplierForPayment } from './supplier-payments-rules';

export const supplierMoneySchema = z.number().finite().min(0).max(1_000_000_000_000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.001, 'Use at most two decimal places');
export const supplierIdSchema = z.string().refine(ObjectId.isValid, 'Invalid supplier or bill id');
export const supplierDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date');
export const supplierTermsSchema = z.object({
  creditLimit: supplierMoneySchema.nullable().optional(),
  criticality: z.enum(['normal', 'important', 'business_stopping']).optional(),
  partialPaymentAllowed: z.boolean().optional(),
});
export function supplierTermsFields(supplier: Document) {
  return supplierPaymentsEnabled() || supplier.creditLimit !== undefined || supplier.criticality !== undefined || supplier.partialPaymentAllowed !== undefined
    ? { creditLimit: supplier.creditLimit ?? null, criticality: supplier.criticality ?? 'normal', partialPaymentAllowed: supplier.partialPaymentAllowed ?? true }
    : {};
}
export const supplierBillSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(100), invoiceDate: supplierDateSchema, dueDate: supplierDateSchema,
  cashDiscountPercentage: z.number().min(0).max(99.99).optional().default(0),
  cashDiscountLastDate: supplierDateSchema.nullish().transform(v => v ?? undefined), partialPaymentAllowed: z.boolean().optional().default(true),
}).superRefine((v, ctx) => {
  if (v.invoiceDate > indiaDate()) ctx.addIssue({ code: 'custom', message: 'Invoice date cannot be in the future', path: ['invoiceDate'] });
  if (v.dueDate < v.invoiceDate) ctx.addIssue({ code: 'custom', message: 'Due date cannot precede invoice date', path: ['dueDate'] });
  if (v.cashDiscountPercentage > 0 && !v.cashDiscountLastDate) ctx.addIssue({ code: 'custom', message: 'Provide the cash discount deadline', path: ['cashDiscountLastDate'] });
  if (v.cashDiscountLastDate && v.cashDiscountLastDate < v.invoiceDate) ctx.addIssue({ code: 'custom', message: 'Discount deadline cannot precede invoice date', path: ['cashDiscountLastDate'] });
});
const requestIdSchema = z.string().trim().min(8).max(128);
export const supplierPaymentSchema = z.object({
  supplierId: supplierIdSchema,
  paymentAllocations: z.array(z.object({ billTransactionId: supplierIdSchema, cashAmount: supplierMoneySchema.positive(), discountAmount: supplierMoneySchema.optional().default(0) })).max(200).default([]),
  previousBalanceCashAmount: supplierMoneySchema.optional().default(0),
  date: supplierDateSchema, description: z.string().max(2000).nullish().transform(v => v ?? undefined),
  billUrl: z.string().url().or(z.literal('')).nullish().transform(v => v ?? undefined), billPublicId: z.string().nullish().transform(v => v ?? undefined),
  requestId: requestIdSchema, expectedVersion: z.number().int().nonnegative(), reservationId: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.paymentAllocations.length === 0 && v.previousBalanceCashAmount === 0) ctx.addIssue({ code: 'custom', message: 'Allocate the payment to a bill or Previous Balance' });
  if (new Set(v.paymentAllocations.map(a => a.billTransactionId)).size !== v.paymentAllocations.length) ctx.addIssue({ code: 'custom', message: 'A bill can appear only once in a payment' });
  if (v.billUrl && !v.billPublicId) ctx.addIssue({ code: 'custom', message: 'billPublicId is required when billUrl is provided' });
  if (v.date > indiaDate()) ctx.addIssue({ code: 'custom', message: 'Actual payments cannot be dated in the future' });
});
export const supplierReserveSchema = z.object({
  supplierId: supplierIdSchema, billTransactionId: supplierIdSchema.optional(), amount: supplierMoneySchema.positive(),
  paymentDate: supplierDateSchema.optional(), recommendationReason: z.string().trim().min(1).max(500).optional(),
  requestId: requestIdSchema, expectedVersion: z.number().int().nonnegative(),
});
export const supplierCancelSchema = z.object({ supplierId: supplierIdSchema, billTransactionId: supplierIdSchema.optional(), reservationId: z.string().min(1), expectedVersion: z.number().int().nonnegative() });

export function enhancedSupplierTransaction(tx: Document) { return tx.entityType === 'supplier' && (tx.billStatus !== undefined || tx.paymentAllocations !== undefined || tx.businessCashApplied === true); }
export function requireSupplierPayments() { if (!supplierPaymentsEnabled()) throw new BusinessCashError('Supplier payments are disabled. This record is protected until the feature is enabled.', 409); }
export function supplierTransactionFields(tx: Document) {
  const fields: Record<string, unknown> = {};
  for (const key of ['invoiceNumber', 'invoiceDate', 'dueDate', 'cashDiscountPercentage', 'cashDiscountLastDate', 'cashDiscountRequiresFullPayment', 'partialPaymentAllowed', 'paidAmount', 'discountReceived', 'pendingAmount', 'billStatus', 'reservedAmount', 'reservationId', 'reservationStatus', 'reservationExpiresAt', 'recommendedPaymentDate', 'recommendationReason', 'cashPaidAmount', 'cashDiscountAmount', 'paymentAllocations', 'previousBalanceCashAmount', 'previousBalanceSettledAmount', 'businessCashApplied', 'businessCashAnchorVersion']) if (tx[key] !== undefined) fields[key] = tx[key];
  return fields;
}
const txFilter = (userId: string, supplierId?: string) => ({ userId, $or: supplierId ? [{ entityType: 'supplier', entityId: supplierId }, { supplierId }] : [{ entityType: 'supplier' }, { supplierId: { $exists: true } }] });
function digest(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function serialize(tx: Document) { const { _id, userId: _userId, ...rest } = tx; void _userId; return { id: _id.toString(), ...rest }; }

/** Canonical allocations, rather than cached bill balances, are used on every write. */
export async function supplierSnapshot(db: Db, userId: string, session?: ClientSession) {
  // Mongo transactions do not support parallel operations on the same session.
  const supplierDocs = await db.collection('suppliers').find({ userId }, { session }).toArray();
  const transactions = await db.collection('transactions').find(txFilter(userId), { session }).toArray();
  const issues: string[] = [];
  const allocationTotals = new Map<string, { cash: number; discount: number; latestDate: string; discountDate?: string }>();
  const billsById = new Map(transactions.filter(tx => tx.type === 'credit' && tx.billStatus !== undefined).map(tx => [tx._id.toString(), tx]));
  for (const tx of transactions) {
    if (tx.type !== 'debit' || !Array.isArray(tx.paymentAllocations)) continue;
    let settled = paise(tx.previousBalanceSettledAmount ?? tx.previousBalanceCashAmount ?? 0);
    let actual = paise(tx.previousBalanceCashAmount ?? 0);
    for (const allocation of tx.paymentAllocations) {
      const bill = billsById.get(allocation.billTransactionId);
      if (!bill || (bill.entityId ?? bill.supplierId) !== (tx.entityId ?? tx.supplierId)) {
        issues.push(`Payment ${tx._id} refers to a missing or different supplier bill.`); continue;
      }
      const old = allocationTotals.get(allocation.billTransactionId) ?? { cash: 0, discount: 0, latestDate: '' };
      const cash = paise(allocation.cashAmount ?? allocation.amount ?? 0);
      const discount = paise(allocation.discountAmount ?? 0);
      const date = new Date(tx.date).toISOString().slice(0, 10);
      if (date > old.latestDate) old.latestDate = date;
      if (discount > 0) old.discountDate = date;
      old.cash += cash; old.discount += discount; allocationTotals.set(allocation.billTransactionId, old);
      settled += cash + discount; actual += cash;
    }
    if (settled !== paise(tx.amount) || actual !== paise(tx.cashPaidAmount ?? tx.amount)) issues.push(`Payment ${tx._id} does not match its bill allocations.`);
  }
  const suppliers: SupplierForPayment[] = supplierDocs.map(supplier => {
    const id = supplier._id.toString();
    const supplierTransactions = transactions.filter(tx => (tx.entityId ?? tx.supplierId) === id);
    const opening = paise(Number(supplier.openingBalance || 0)) * (supplier.balanceType === 'credit' ? 1 : -1);
    const signedDue = supplierTransactions.reduce((sum, tx) => sum + paise(tx.amount) * (tx.type === 'credit' ? 1 : -1), opening);
    const bills = supplierTransactions.filter(tx => tx.type === 'credit' && tx.billStatus !== undefined).map(tx => {
      const totals = allocationTotals.get(tx._id.toString()) ?? { cash: 0, discount: 0, latestDate: '' };
      const pending = paise(tx.amount) - totals.cash - totals.discount;
      if (pending < 0) issues.push(`Invoice ${tx.invoiceNumber} is over-settled.`);
      if (totals.discount > 0 && pending !== 0) issues.push(`Invoice ${tx.invoiceNumber} has a cash discount without full settlement. Reverse the discounted payment before changing earlier payments.`);
      if (totals.discount > 0 && (!tx.cashDiscountLastDate || totals.latestDate > tx.cashDiscountLastDate || (totals.discountDate && totals.latestDate > totals.discountDate))) issues.push(`Invoice ${tx.invoiceNumber} was not fully settled on the recorded discount payment date within its discount deadline.`);
      return { ...serialize(tx), id: tx._id.toString(), amount: Number(tx.amount), paidAmount: totals.cash / 100, discountReceived: totals.discount / 100, pendingAmount: pending / 100,
        invoiceNumber: tx.invoiceNumber, invoiceDate: tx.invoiceDate, dueDate: tx.dueDate,
        billStatus: pending === 0 ? 'paid' : totals.cash > 0 ? 'partial' : 'unpaid' } as BillForPayment;
    });
    const tracked = bills.reduce((sum, bill) => sum + paise(bill.pendingAmount), 0);
    const residual = Math.max(0, signedDue) - tracked;
    if (residual < 0) issues.push(`${supplier.name}: supplier ledger due is lower than tracked bills by ₹${(-residual / 100).toFixed(2)}. Allocate earlier payments before using recommendations.`);
    return { id, name: supplier.name, totalDue: Math.max(0, signedDue) / 100, previousBalance: Math.max(0, residual) / 100,
      creditLimit: supplier.creditLimit ?? null, criticality: supplier.criticality ?? 'normal', partialPaymentAllowed: supplier.partialPaymentAllowed ?? true,
      bills, previousBalanceReservation: supplier.previousBalanceReservation };
  });
  return { suppliers, transactions, supplierDocs, issues };
}

export async function rebuildSupplierBills(db: Db, userId: string, session: ClientSession): Promise<string[]> {
  const snapshot = await supplierSnapshot(db, userId, session);
  for (const supplier of snapshot.suppliers) for (const bill of supplier.bills) {
    if (bill.pendingAmount < 0) continue;
    await db.collection('transactions').updateOne({ _id: new ObjectId(bill.id), userId }, { $set: { paidAmount: bill.paidAmount, discountReceived: bill.discountReceived, pendingAmount: bill.pendingAmount, billStatus: bill.pendingAmount === 0 ? 'paid' : bill.paidAmount > 0 ? 'partial' : 'unpaid' } }, { session });
  }
  return snapshot.issues;
}

function reservationRows(suppliers: SupplierForPayment[], now = new Date()) {
  const rows: Array<Record<string, unknown> & { amount: number }> = [];
  for (const supplier of suppliers) {
    for (const bill of supplier.bills) if (activeReservation(bill.reservationStatus, bill.reservationExpiresAt, now)) rows.push({ targetType: 'bill', supplierId: supplier.id, supplierName: supplier.name, billTransactionId: bill.id, invoiceNumber: bill.invoiceNumber, reservationId: bill.reservationId, amount: bill.reservedAmount || 0, paymentDate: bill.recommendedPaymentDate, expiresAt: bill.reservationExpiresAt, reason: bill.recommendationReason });
    const reserve = supplier.previousBalanceReservation;
    if (activeReservation(reserve?.status, reserve?.expiresAt, now)) rows.push({ targetType: 'previous_balance', supplierId: supplier.id, supplierName: supplier.name, reservationId: reserve!.id, amount: reserve!.amount, paymentDate: reserve!.recommendedPaymentDate, expiresAt: reserve!.expiresAt, reason: reserve!.reason });
  }
  return rows;
}
async function buildSupplierPaymentSummary(db: Db, userId: string, options: { date?: string; supplierId?: string }, session: ClientSession) {
  requireSupplierPayments();
  const snapshot = await supplierSnapshot(db, userId, session);
  const cash = await readBusinessCash(db, userId, session);
  const reservations = reservationRows(snapshot.suppliers);
  const reservedAmount = money(reservations.reduce((sum, row) => sum + row.amount, 0));
  const availableAmount = money((cash?.currentBalance ?? 0) - (cash?.protectedAmount ?? 0) - reservedAmount);
  const today = options.date ?? indiaDate();
  const payments = snapshot.transactions.filter(tx => tx.type === 'debit').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const dailySupplierPayments = money(payments.filter(tx => new Date(tx.date).toISOString().slice(0, 10) === today).reduce((sum, tx) => sum + Number(tx.cashPaidAmount ?? tx.amount), 0));
  const recommendations = cash && !cash.needsReconciliation && snapshot.issues.length === 0 ? recommendSupplierPayments(snapshot.suppliers, availableAmount) : [];
  return { businessCash: cash, summary: { currentBalance: cash?.currentBalance ?? 0, protectedAmount: cash?.protectedAmount ?? 0, reservedAmount, availableAmount, dailySupplierPayments },
    suppliers: snapshot.suppliers.filter(s => !options.supplierId || s.id === options.supplierId), recommendations: recommendations.filter(r => !options.supplierId || r.supplierId === options.supplierId),
    reservations: reservations.filter(r => !options.supplierId || r.supplierId === options.supplierId), payments: payments.filter(tx => !options.supplierId || (tx.entityId ?? tx.supplierId) === options.supplierId).slice(0, 100).map(serialize), issues: snapshot.issues, version: cash?.version ?? 0 };
}

export async function getSupplierPaymentSummary(_db: Db, userId: string, options: { date?: string; supplierId?: string } = {}) {
  // The version must describe the same point in time as the bills and cash used
  // to recommend a payment. A snapshot prevents mixed reads during another write.
  return withBusinessCashTransaction(userId, (db, session) => buildSupplierPaymentSummary(db, userId, options, session));
}

async function invalidate(userId: string, supplierId: string) {
  const [{ getDb }, { refreshUserReadModels }, { bumpCacheVersions }, { default: redis }] = await Promise.all([import('./mongodb'), import('./read-models'), import('./cache-version'), import('./redis')]);
  const db = await getDb();
  await Promise.all([refreshUserReadModels(db, userId), bumpCacheVersions(userId, ['suppliers', 'dashboard', 'bootstrap']), redis.del(`ledger:supplier:${supplierId}:${userId}`)]);
}
function requireSupplier(snapshot: Awaited<ReturnType<typeof supplierSnapshot>>, id: string) {
  const supplier = snapshot.suppliers.find(s => s.id === id);
  if (!supplier) throw new BusinessCashError('Supplier not found', 404);
  return supplier;
}
function requireConsistency(issues: string[]) { if (issues.length) throw new BusinessCashError(issues[0]); }

export async function reserveSupplierPayment(userId: string, input: unknown) {
  const data = supplierReserveSchema.parse(input); requireSupplierPayments();
  const result = await withBusinessCashTransaction(userId, async (db, session) => {
    const snapshot = await supplierSnapshot(db, userId, session);
    const supplier = requireSupplier(snapshot, data.supplierId);
    const bill = data.billTransactionId ? supplier.bills.find(b => b.id === data.billTransactionId) : undefined;
    if (data.billTransactionId && !bill) throw new BusinessCashError('Bill not found', 404);
    const existingId = bill ? bill.reservationId : supplier.previousBalanceReservation?.id;
    const existingRequest = bill ? snapshot.transactions.find(tx => tx._id.toString() === bill.id)?.reservationRequestId : snapshot.supplierDocs.find(s => s._id.toString() === supplier.id)?.previousBalanceReservation?.requestId;
    const hash = digest({ supplierId: data.supplierId, billTransactionId: data.billTransactionId, amount: data.amount, paymentDate: data.paymentDate, recommendationReason: data.recommendationReason });
    const previousHash = bill ? snapshot.transactions.find(tx => tx._id.toString() === bill.id)?.reservationRequestHash : snapshot.supplierDocs.find(s => s._id.toString() === supplier.id)?.previousBalanceReservation?.requestHash;
    if (existingRequest === data.requestId) {
      if (previousHash !== hash) throw new BusinessCashError('Request id has already been used for different reservation details');
      return { reservationId: existingId, repeated: true };
    }
    const cash = await assertBusinessCashReady(db, userId, session, data.expectedVersion);
    requireConsistency(snapshot.issues);
    const date = data.paymentDate ?? indiaDate();
    if (date < indiaDate()) throw new BusinessCashError('A payment cannot be reserved for a past date', 400);
    const now = new Date();
    if (bill ? activeReservation(bill.reservationStatus, bill.reservationExpiresAt, now) : activeReservation(supplier.previousBalanceReservation?.status, supplier.previousBalanceReservation?.expiresAt, now)) throw new BusinessCashError('This balance already has an active reservation');
    const pending = bill?.pendingAmount ?? supplier.previousBalance;
    const discount = bill ? eligibleDiscount(bill, date) : 0;
    if (data.amount > pending || data.amount <= 0) throw new BusinessCashError('Reservation exceeds the pending amount', 400);
    if ((!supplier.partialPaymentAllowed || bill?.partialPaymentAllowed === false) && paise(data.amount) !== paise(pending - discount) && paise(data.amount) !== paise(pending)) throw new BusinessCashError('This supplier requires full payment', 400);
    const reserved = reservationRows(snapshot.suppliers, now).reduce((sum, row) => sum + paise(row.amount), 0);
    if (paise(data.amount) > paise(cash.currentBalance - cash.protectedAmount) - reserved) throw new BusinessCashError('Not enough unreserved money above your protected amount');
    const reservationId = randomUUID();
    const expiresAt = new Date(new Date(`${date}T00:00:00+05:30`).getTime() + 86400000).toISOString();
    const recommendationReason = data.recommendationReason ?? 'Owner accepted payment reservation';
    if (bill) await db.collection('transactions').updateOne({ _id: new ObjectId(bill.id), userId }, { $set: { reservedAmount: data.amount, reservationId, reservationStatus: 'active', reservationExpiresAt: expiresAt, recommendedPaymentDate: date, recommendationReason, reservationRequestId: data.requestId, reservationRequestHash: hash } }, { session });
    else await db.collection('suppliers').updateOne({ _id: new ObjectId(supplier.id), userId }, { $set: { previousBalanceReservation: { id: reservationId, amount: data.amount, status: 'active', expiresAt, recommendedPaymentDate: date, reason: recommendationReason, requestId: data.requestId, requestHash: hash } } }, { session });
    await applyBusinessCashDelta(db, userId, 0, session);
    return { reservationId, repeated: false };
  });
  return result;
}

export async function cancelSupplierReservation(userId: string, input: unknown) {
  const data = supplierCancelSchema.parse(input); requireSupplierPayments();
  return withBusinessCashTransaction(userId, async (db, session) => {
    const snapshot = await supplierSnapshot(db, userId, session);
    const supplier = requireSupplier(snapshot, data.supplierId);
    const bill = data.billTransactionId ? supplier.bills.find(b => b.id === data.billTransactionId) : undefined;
    if (data.billTransactionId && !bill) throw new BusinessCashError('Bill not found', 404);
    const id = bill ? bill.reservationId : supplier.previousBalanceReservation?.id;
    if (id !== data.reservationId) throw new BusinessCashError('Reservation no longer matches this balance');
    if ((bill ? bill.reservationStatus : supplier.previousBalanceReservation?.status) !== 'active') return { cancelled: true };
    await assertBusinessCashReady(db, userId, session, data.expectedVersion);
    if (bill) await db.collection('transactions').updateOne({ _id: new ObjectId(bill.id), userId }, { $set: { reservedAmount: 0, reservationStatus: 'cancelled' } }, { session });
    else await db.collection('suppliers').updateOne({ _id: new ObjectId(supplier.id), userId }, { $set: { 'previousBalanceReservation.amount': 0, 'previousBalanceReservation.status': 'cancelled' } }, { session });
    await applyBusinessCashDelta(db, userId, 0, session);
    return { cancelled: true };
  });
}

export async function createSupplierPayment(userId: string, input: unknown, existingId?: string) {
  const data = supplierPaymentSchema.parse(input); requireSupplierPayments();
  const hash = digest({ ...data, expectedVersion: undefined, requestId: undefined });
  const result = await withBusinessCashTransaction(userId, async (db, session) => {
    const transactions = db.collection('transactions');
    const prior = await transactions.findOne({ userId, $or: [{ supplierPaymentRequestId: data.requestId }, { 'supplierPaymentRequestHistory.requestId': data.requestId }] }, { session });
    if (prior) {
      const originalHash = prior.supplierPaymentRequestId === data.requestId ? prior.supplierPaymentRequestHash : prior.supplierPaymentRequestHistory?.find((r: { requestId: string }) => r.requestId === data.requestId)?.requestHash;
      if (originalHash !== hash) throw new BusinessCashError('Request id has already been used for different payment details');
      if (existingId && prior._id.toString() !== existingId) throw new BusinessCashError('Request id belongs to another transaction');
      return serialize(prior);
    }
    let old: Document | null = null;
    if (existingId) {
      old = await transactions.findOne({ _id: new ObjectId(existingId), userId, entityType: 'supplier', type: 'debit' }, { session });
      if (!old || (old.entityId ?? old.supplierId) !== data.supplierId) throw new BusinessCashError('Payment cannot be moved to another supplier', 400);
    }
    // Allocation-only repair of an old payment is allowed before cash reconciliation.
    const cashTotal = money(data.paymentAllocations.reduce((sum, a) => sum + a.cashAmount, data.previousBalanceCashAmount));
    const repairOnly = old && !old.paymentAllocations && paise(cashTotal) === paise(old.amount) && data.paymentAllocations.every(a => a.discountAmount === 0);
    if (repairOnly && old && new Date(old.date).toISOString().slice(0, 10) !== data.date) throw new BusinessCashError('Keep the original payment date while assigning historical payments to bills', 400);
    const cash = repairOnly ? await readBusinessCash(db, userId, session) : await assertBusinessCashReady(db, userId, session, data.expectedVersion);
    if (!cash || cash.version !== data.expectedVersion) throw new BusinessCashError('Refresh your business balance before recording payment');
    if (old && !repairOnly) requireConsistency((await supplierSnapshot(db, userId, session)).issues);
    if (old) await transactions.deleteOne({ _id: old._id, userId }, { session });
    const snapshot = await supplierSnapshot(db, userId, session);
    const supplier = requireSupplier(snapshot, data.supplierId);
    if (!repairOnly && !old) requireConsistency(snapshot.issues);
    const allocations = data.paymentAllocations.map(a => {
      const bill = supplier.bills.find(b => b.id === a.billTransactionId);
      if (!bill) throw new BusinessCashError('Bill not found for this supplier', 404);
      if (data.date < bill.invoiceDate) throw new BusinessCashError('Payment cannot precede the invoice date', 400);
      const allowedDiscount = eligibleDiscount(bill, data.date);
      if (a.discountAmount > 0 && paise(a.discountAmount) !== paise(allowedDiscount)) throw new BusinessCashError(`Discount is not valid for invoice ${bill.invoiceNumber}`, 400);
      const settledAmount = money(a.cashAmount + a.discountAmount);
      if (settledAmount > bill.pendingAmount) throw new BusinessCashError(`Payment exceeds invoice ${bill.invoiceNumber} pending amount`, 400);
      if (a.discountAmount > 0 && paise(settledAmount) !== paise(bill.pendingAmount)) throw new BusinessCashError('Cash discount requires full invoice settlement', 400);
      if ((!supplier.partialPaymentAllowed || bill.partialPaymentAllowed === false) && paise(settledAmount) !== paise(bill.pendingAmount)) throw new BusinessCashError('This bill requires full settlement', 400);
      return { billTransactionId: bill.id, cashAmount: a.cashAmount, discountAmount: a.discountAmount, settledAmount };
    });
    if (data.previousBalanceCashAmount > supplier.previousBalance) throw new BusinessCashError('Payment exceeds Previous Balance', 400);
    if (!supplier.partialPaymentAllowed && data.previousBalanceCashAmount > 0 && data.previousBalanceCashAmount !== supplier.previousBalance) throw new BusinessCashError('Previous Balance must be settled in full', 400);
    const reservations = reservationRows(snapshot.suppliers);
    const targets = new Set(allocations.map(a => a.billTransactionId));
    const unrelatedReserved = reservations.filter(r => !(r.supplierId === data.supplierId && (r.billTransactionId ? targets.has(String(r.billTransactionId)) : data.previousBalanceCashAmount > 0))).reduce((sum, row) => sum + paise(row.amount), 0);
    const refundedCash = old ? Number(old.cashPaidAmount ?? old.amount) : 0;
    if (!repairOnly && paise(cashTotal - refundedCash) > paise(cash.currentBalance - cash.protectedAmount) - unrelatedReserved) throw new BusinessCashError('Payment would use protected money or money reserved for other bills');
    if (data.reservationId && !reservations.some(r => r.reservationId === data.reservationId && r.supplierId === data.supplierId && (r.billTransactionId ? targets.has(String(r.billTransactionId)) : data.previousBalanceCashAmount > 0))) throw new BusinessCashError('Reservation expired or changed. Refresh before recording payment');
    const marker = await applyBusinessCashDelta(db, userId, money(refundedCash - cashTotal), session, old ? { businessCashApplied: old.businessCashApplied, businessCashAnchorVersion: old.businessCashAnchorVersion } : undefined);
    const document = { _id: old?._id ?? new ObjectId(), userId, entityType: 'supplier', entityId: data.supplierId, supplierId: data.supplierId, type: 'debit',
      amount: money(allocations.reduce((sum, a) => sum + a.settledAmount, data.previousBalanceCashAmount)), cashPaidAmount: cashTotal,
      cashDiscountAmount: money(allocations.reduce((sum, a) => sum + a.discountAmount, 0)), paymentAllocations: allocations,
      previousBalanceCashAmount: data.previousBalanceCashAmount, previousBalanceSettledAmount: data.previousBalanceCashAmount,
      description: data.description ?? old?.description ?? '', billUrl: data.billUrl ?? old?.billUrl, billPublicId: data.billPublicId ?? old?.billPublicId,
      date: new Date(data.date), createdAt: old?.createdAt ?? new Date(), updatedAt: new Date(), ...marker,
      supplierPaymentRequestId: old?.supplierPaymentRequestId ?? data.requestId, supplierPaymentRequestHash: old?.supplierPaymentRequestHash ?? hash,
      ...(old?.supplierPaymentRequestId ? { supplierPaymentRequestHistory: [...(old.supplierPaymentRequestHistory ?? []), { requestId: data.requestId, requestHash: hash }] } : {}) };
    await transactions.insertOne(document, { session });
    for (const a of allocations) await transactions.updateOne({ _id: new ObjectId(a.billTransactionId), userId }, { $set: { reservedAmount: 0, reservationStatus: 'paid' } }, { session });
    if (data.previousBalanceCashAmount > 0) await db.collection('suppliers').updateOne({ _id: new ObjectId(data.supplierId), userId }, { $set: { 'previousBalanceReservation.amount': 0, 'previousBalanceReservation.status': 'paid' } }, { session });
    const issues = await rebuildSupplierBills(db, userId, session);
    if (!repairOnly) requireConsistency(issues);
    else if (issues.length) await db.collection('users').updateOne({ _id: new ObjectId(userId) }, { $set: { 'businessCash.needsReconciliation': true } }, { session });
    return serialize(document);
  });
  await invalidate(userId, data.supplierId);
  return result;
}

export async function saveSupplierBill(userId: string, input: Document, existingId?: string) {
  requireSupplierPayments();
  const terms = supplierBillSchema.parse(input);
  const transactionDate = supplierDateSchema.parse(input.date instanceof Date ? input.date.toISOString().slice(0, 10) : input.date ?? terms.invoiceDate);
  if (transactionDate > indiaDate()) throw new BusinessCashError('Supplier purchase date cannot be in the future', 400);
  const amount = supplierMoneySchema.positive().parse(input.amount);
  const entityId = supplierIdSchema.parse(input.entityId);
  const result = await withBusinessCashTransaction(userId, async (db, session) => {
    const supplier = await db.collection('suppliers').findOne({ _id: new ObjectId(entityId), userId }, { session });
    if (!supplier) throw new BusinessCashError('Supplier not found', 404);
    const txs = db.collection('transactions');
    const old = existingId ? await txs.findOne({ _id: new ObjectId(existingId), userId }, { session }) : null;
    if (existingId && (!old || old.type !== 'credit' || old.entityType !== 'supplier' || old.entityId !== entityId)) throw new BusinessCashError('A tracked invoice cannot be moved to another supplier or transaction type', 400);
    const hash = digest({ entityId, amount, ...terms, description: input.description, date: transactionDate, billUrl: input.billUrl, billPublicId: input.billPublicId });
    if (!existingId && input.requestId) {
      requestIdSchema.parse(input.requestId);
      const prior = await txs.findOne({ userId, supplierPaymentRequestId: input.requestId }, { session });
      if (prior) {
        if (prior.supplierPaymentRequestHash !== hash) throw new BusinessCashError('Request id already used for another invoice');
        return serialize(prior);
      }
    }
    const duplicate = await txs.findOne({ userId, entityType: 'supplier', entityId, type: 'credit', invoiceNumber: terms.invoiceNumber, billStatus: { $exists: true }, ...(old ? { _id: { $ne: old._id } } : {}) }, { session });
    if (duplicate) throw new BusinessCashError('This invoice number is already recorded for this supplier', 409);
    const snapshot = await supplierSnapshot(db, userId, session);
    const bill = snapshot.suppliers.find(s => s.id === entityId)?.bills.find(b => b.id === existingId);
    const paidAmount = bill?.paidAmount ?? 0;
    const discountReceived = bill?.discountReceived ?? 0;
    if (existingId && snapshot.transactions.some(tx => tx.type === 'debit' && tx.paymentAllocations?.some((a: { billTransactionId: string }) => a.billTransactionId === existingId) && new Date(tx.date).toISOString().slice(0, 10) < terms.invoiceDate)) throw new BusinessCashError('Invoice date cannot be later than a payment already allocated to it', 400);
    if (amount < money(paidAmount + discountReceived)) throw new BusinessCashError('Invoice amount cannot be lower than payments already allocated to it', 400);
    if (discountReceived && (amount !== old?.amount || terms.cashDiscountPercentage !== old?.cashDiscountPercentage || terms.cashDiscountLastDate !== old?.cashDiscountLastDate || terms.invoiceDate !== old?.invoiceDate)) throw new BusinessCashError('Reverse the discounted payment before changing its invoice discount terms', 409);
    const pendingAmount = money(amount - paidAmount - discountReceived);
    const doc = { ...old, _id: old?._id ?? new ObjectId(), userId, entityType: 'supplier', entityId, supplierId: entityId, type: 'credit', amount, ...terms,
      cashDiscountRequiresFullPayment: true, paidAmount, discountReceived, pendingAmount, billStatus: pendingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      reservedAmount: 0, reservationStatus: 'cancelled', description: input.description ?? old?.description ?? '',
      billUrl: input.billUrl ?? old?.billUrl, billPublicId: input.billPublicId ?? old?.billPublicId,
      date: new Date(transactionDate), createdAt: old?.createdAt ?? new Date(), updatedAt: new Date(),
      ...(!existingId && input.requestId ? { supplierPaymentRequestId: input.requestId, supplierPaymentRequestHash: hash } : {}) };
    if (Number.isNaN(doc.date.getTime())) throw new BusinessCashError('Invalid transaction date', 400);
    await applyBusinessCashDelta(db, userId, 0, session);
    if (old) await txs.replaceOne({ _id: old._id, userId }, doc, { session }); else await txs.insertOne(doc, { session });
    return serialize(doc);
  });
  await invalidate(userId, entityId);
  return result;
}

/** Existing legacy credits can still be edited without inventing invoice terms.
 * New purchases are required to use saveSupplierBill while the feature is on. */
export async function saveUntrackedSupplierCredit(userId: string, input: Document, existingId?: string) {
  requireSupplierPayments();
  const entityId = supplierIdSchema.parse(input.entityId);
  const amount = supplierMoneySchema.positive().parse(input.amount);
  const transactionDate = supplierDateSchema.parse(input.date instanceof Date ? input.date.toISOString().slice(0, 10) : input.date);
  if (transactionDate > indiaDate()) throw new BusinessCashError('Supplier purchase date cannot be in the future', 400);
  const result = await withBusinessCashTransaction(userId, async (db, session) => {
    const supplier = await db.collection('suppliers').findOne({ _id: new ObjectId(entityId), userId }, { session });
    if (!supplier) throw new BusinessCashError('Supplier not found', 404);
    const txs = db.collection('transactions');
    const old = existingId ? await txs.findOne({ _id: new ObjectId(existingId), userId }, { session }) : null;
    if (existingId && (!old || old.type !== 'credit' || (old.entityId ?? old.supplierId) !== entityId || old.billStatus !== undefined)) throw new BusinessCashError('Use the invoice editor for this transaction', 409);
    const doc = { ...old, _id: old?._id ?? new ObjectId(), userId, entityType: 'supplier', entityId, supplierId: entityId, type: 'credit', amount,
      description: input.description ?? old?.description ?? '', billUrl: input.billUrl ?? old?.billUrl, billPublicId: input.billPublicId ?? old?.billPublicId,
      date: new Date(transactionDate), createdAt: old?.createdAt ?? new Date() };
    if (Number.isNaN(doc.date.getTime())) throw new BusinessCashError('Invalid transaction date', 400);
    if (old) await txs.replaceOne({ _id: old._id, userId }, doc, { session }); else await txs.insertOne(doc, { session });
    const issues = await rebuildSupplierBills(db, userId, session);
    requireConsistency(issues);
    await applyBusinessCashDelta(db, userId, 0, session);
    return serialize(doc);
  });
  await invalidate(userId, entityId);
  return result;
}

export async function deleteSupplierTransaction(userId: string, id: string) {
  requireSupplierPayments();
  const result = await withBusinessCashTransaction(userId, async (db, session) => {
    const txs = db.collection('transactions');
    const tx = await txs.findOne({ _id: new ObjectId(id), userId, entityType: 'supplier' }, { session });
    if (!tx) throw new BusinessCashError('Transaction not found', 404);
    if (tx.type === 'credit') {
      const linked = await txs.findOne({ userId, 'paymentAllocations.billTransactionId': id }, { session });
      if (linked) throw new BusinessCashError('Remove or reallocate the linked supplier payments before deleting this invoice');
    }
    await txs.deleteOne({ _id: tx._id, userId }, { session });
    const delta = tx.type === 'debit' ? Number(tx.cashPaidAmount ?? tx.amount) : 0;
    await applyBusinessCashDelta(db, userId, delta, session, tx.type === 'debit' ? { businessCashApplied: tx.businessCashApplied, businessCashAnchorVersion: tx.businessCashAnchorVersion } : undefined);
    requireConsistency(await rebuildSupplierBills(db, userId, session));
    return { supplierId: tx.entityId ?? tx.supplierId, transaction: serialize(tx) };
  });
  await invalidate(userId, result.supplierId);
  return result;
}
