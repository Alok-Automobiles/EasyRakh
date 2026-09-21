import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { BusinessCashError, cashMoney, clearBusinessCashReservations, readBusinessCash, withBusinessCashTransaction } from './business-cash';
import { featureEpoch, supplierPaymentsEnabled } from './supplier-payment-settings';
import type { BusinessCash } from './types';

export const cashAmountSchema = z.number().finite().min(0).max(1_000_000_000_000)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, 'Use at most two decimal places');
const commandKey = z.string().trim().min(8).max(128);
export const openingCashSchema = z.object({
  currentBalance: cashAmountSchema, protectedAmount: cashAmountSchema,
  idempotencyKey: commandKey,
});
export const reconcileCashSchema = z.object({
  currentBalance: cashAmountSchema,
  reason: z.string().trim().min(1).max(500),
  expectedVersion: z.number().int().nonnegative(), idempotencyKey: commandKey,
});
export const protectedCashSchema = z.object({
  protectedAmount: cashAmountSchema,
  expectedVersion: z.number().int().nonnegative(), idempotencyKey: commandKey,
});

export async function confirmBusinessCash(kind: 'opening' | 'reconciliation', body: unknown, userId: string) {
  if (!supplierPaymentsEnabled()) throw new BusinessCashError('Supplier payments are disabled', 404);
  const input = kind === 'opening' ? openingCashSchema.parse(body) : reconcileCashSchema.parse(body);
  const fingerprint = JSON.stringify({ kind, currentBalance: input.currentBalance,
    protectedAmount: 'protectedAmount' in input ? input.protectedAmount : undefined,
    reason: 'reason' in input ? input.reason : undefined });
  return withBusinessCashTransaction(userId, async (db, session) => {
    const adjustments = db.collection('businessBalanceAdjustments');
    const previous = await adjustments.findOne({ userId, idempotencyKey: input.idempotencyKey }, { session });
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new BusinessCashError('This request was already used for a different balance correction');
      return { businessCash: await readBusinessCash(db, userId, session), replayed: true };
    }
    const users = db.collection('users');
    const user = await users.findOne({ _id: new ObjectId(userId) }, { session });
    if (!user) throw new BusinessCashError('User not found', 404);
    const existing = user.businessCash as BusinessCash | undefined;
    if (kind === 'opening' && existing) throw new BusinessCashError('Business balance is already set up. Use balance confirmation to correct it.');
    if (kind === 'reconciliation') {
      if (!existing) throw new BusinessCashError('Set up your business balance first');
      if ('expectedVersion' in input && input.expectedVersion !== existing.version) {
        throw new BusinessCashError('Your balance changed. Refresh before confirming it.');
      }
    }
    const { rebuildSupplierBills } = await import('./supplier-payments');
    const issues = await rebuildSupplierBills(db, userId, session);
    if (issues.length) throw new BusinessCashError(issues[0]);
    const now = new Date();
    const cash: BusinessCash = {
      currentBalance: cashMoney(input.currentBalance),
      protectedAmount: 'protectedAmount' in input ? cashMoney(input.protectedAmount) : existing!.protectedAmount,
      initializedAt: existing?.initializedAt ?? now, updatedAt: now,
      lastReconciledAt: now, needsReconciliation: false,
      anchorVersion: (existing?.anchorVersion ?? 0) + 1,
      version: (existing?.version ?? 0) + 1, featureEpoch: featureEpoch(),
    };
    await users.updateOne({ _id: user._id }, { $set: { businessCash: cash } }, { session });
    await clearBusinessCashReservations(db, userId, session);
    await adjustments.insertOne({ userId, kind, idempotencyKey: input.idempotencyKey, fingerprint,
      balanceBefore: existing?.currentBalance ?? 0, balanceAfter: cash.currentBalance,
      difference: cashMoney(cash.currentBalance - (existing?.currentBalance ?? 0)),
      anchorVersion: cash.anchorVersion, reason: 'reason' in input ? input.reason : 'Opening business balance',
      date: now, createdAt: now }, { session });
    return { businessCash: cash, replayed: false };
  });
}

export async function changeProtectedCash(body: unknown, userId: string) {
  if (!supplierPaymentsEnabled()) throw new BusinessCashError('Supplier payments are disabled', 404);
  const input = protectedCashSchema.parse(body);
  return withBusinessCashTransaction(userId, async (db, session) => {
    const users = db.collection('users');
    const user = await users.findOne({ _id: new ObjectId(userId) }, { session });
    const cash = user?.businessCash as BusinessCash | undefined;
    if (!cash) throw new BusinessCashError('Set up your business balance first');
    const requestHistory = Array.isArray(user?.protectedCashRequestHistory)
      ? user.protectedCashRequestHistory as Array<{ id: string; amount: number }>
      : [];
    const legacyRequest = user?.protectedCashRequest as { id: string; amount: number } | undefined;
    const previousRequest = [...requestHistory, ...(legacyRequest ? [legacyRequest] : [])]
      .find(request => request.id === input.idempotencyKey);
    if (previousRequest) {
      if (previousRequest.amount !== input.protectedAmount) throw new BusinessCashError('This request was already used for another protected amount');
      return { businessCash: await readBusinessCash(db, userId, session), replayed: true };
    }
    if (cash.version !== input.expectedVersion) throw new BusinessCashError('Your balance changed. Refresh and try again.');
    const next: BusinessCash = { ...cash, protectedAmount: cashMoney(input.protectedAmount),
      version: cash.version + 1, updatedAt: new Date() };
    const retainedHistory = legacyRequest && !requestHistory.some(request => request.id === legacyRequest.id)
      ? [...requestHistory, legacyRequest]
      : requestHistory;
    const protectedCashRequest = { id: input.idempotencyKey, amount: input.protectedAmount };
    await users.updateOne({ _id: user!._id }, { $set: { businessCash: next,
      protectedCashRequest, protectedCashRequestHistory: [...retainedHistory, protectedCashRequest] } }, { session });
    // Review allocations whenever the owner changes the money they want protected.
    await clearBusinessCashReservations(db, userId, session);
    return { businessCash: { ...next, needsReconciliation: next.needsReconciliation || next.featureEpoch !== featureEpoch() }, replayed: false };
  });
}
