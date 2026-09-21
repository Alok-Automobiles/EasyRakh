import { ClientSession, Db, ObjectId, type MongoClient } from 'mongodb';
import { featureEpoch, supplierPaymentsEnabled } from './supplier-payment-settings';
import type { BusinessCash } from './types';
import { ensureSupplierPaymentIndexes } from './supplier-payment-indexes';

const readyClients = new WeakMap<MongoClient, Promise<void>>();

export class BusinessCashError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export type CashMarker = {
  businessCashApplied?: boolean;
  businessCashAnchorVersion?: number;
};

export function cashMoney(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) {
    throw new BusinessCashError('Invalid money amount', 400);
  }
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

export async function withBusinessCashTransaction<T>(
  userId: string,
  callback: (db: Db, session: ClientSession) => Promise<T>,
): Promise<T> {
  if (!ObjectId.isValid(userId)) throw new BusinessCashError('Invalid user', 401);
  const { default: clientPromise } = await import('./mongodb');
  const client = await clientPromise;
  let readiness = readyClients.get(client);
  if (!readiness) {
    readiness = ensureSupplierPaymentIndexes(client.db('ledger')).catch(error => {
      readyClients.delete(client);
      throw error;
    });
    readyClients.set(client, readiness);
  }
  await readiness;
  const session = client.startSession();
  try {
    return await session.withTransaction(() => callback(client.db('ledger'), session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
    });
  } finally { await session.endSession(); }
}

export async function readBusinessCash(db: Db, userId: string, session?: ClientSession): Promise<BusinessCash | null> {
  const user = await db.collection('users').findOne(
    { _id: new ObjectId(userId) }, { session, projection: { businessCash: 1 } },
  );
  const cash = user?.businessCash as BusinessCash | undefined;
  if (!cash) return null;
  return { ...cash, needsReconciliation: cash.needsReconciliation || cash.featureEpoch !== featureEpoch() };
}

export async function assertBusinessCashReady(
  db: Db, userId: string, session: ClientSession, expectedVersion?: number,
): Promise<BusinessCash> {
  if (!supplierPaymentsEnabled()) throw new BusinessCashError('Supplier payments are disabled', 404);
  const cash = await readBusinessCash(db, userId, session);
  if (!cash) throw new BusinessCashError('Set up your business balance first');
  if (cash.needsReconciliation) throw new BusinessCashError('Confirm your business balance before planning payments');
  if (expectedVersion !== undefined && cash.version !== expectedVersion) {
    throw new BusinessCashError('Your balance or recommendations changed. Refresh and try again.');
  }
  return cash;
}

/** Used inside the SAME transaction as the source entry. Never call for ledger receipts
 * already represented in Daily Cash. Passing a marker means editing an existing entry. */
export async function applyBusinessCashDelta(
  db: Db, userId: string, delta: number, session: ClientSession, previousMarker?: CashMarker,
): Promise<CashMarker> {
  if (!supplierPaymentsEnabled()) return previousMarker || {};
  delta = cashMoney(delta);
  const users = db.collection('users');
  const user = await users.findOne({ _id: new ObjectId(userId) }, { session });
  if (!user) throw new BusinessCashError('User not found', 404);
  const cash = user.businessCash as BusinessCash | undefined;
  if (!cash) {
    // Serialize a first cash entry with concurrent opening-balance setup.
    await users.updateOne({ _id: user._id }, { $inc: { businessCashWriteVersion: 1 } }, { session });
    return {};
  }
  const oldEntry = previousMarker !== undefined && (
    !previousMarker.businessCashApplied || previousMarker.businessCashAnchorVersion !== cash.anchorVersion
  );
  const staleEpoch = cash.featureEpoch !== featureEpoch();
  if (staleEpoch || oldEntry) {
    await users.updateOne({ _id: user._id }, {
      $inc: { 'businessCash.version': 1 },
      $set: { 'businessCash.updatedAt': new Date(), ...((delta !== 0 || staleEpoch) ? { 'businessCash.needsReconciliation': true } : {}) },
    }, { session });
    return previousMarker || {};
  }
  await users.updateOne({ _id: user._id }, {
    $set: { 'businessCash.currentBalance': cashMoney(cash.currentBalance + delta), 'businessCash.updatedAt': new Date() },
    $inc: { 'businessCash.version': 1 },
  }, { session });
  return { businessCashApplied: true, businessCashAnchorVersion: cash.anchorVersion };
}

export async function clearBusinessCashReservations(db: Db, userId: string, session: ClientSession) {
  await db.collection('transactions').updateMany(
    { userId, entityType: 'supplier', reservationStatus: 'active' },
    { $set: { reservedAmount: 0, reservationStatus: 'cancelled' } }, { session },
  );
  await db.collection('suppliers').updateMany(
    { userId, 'previousBalanceReservation.status': 'active' },
    { $set: { 'previousBalanceReservation.amount': 0, 'previousBalanceReservation.status': 'cancelled' } }, { session },
  );
}
