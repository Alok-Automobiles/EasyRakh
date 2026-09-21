import type { Db } from 'mongodb';

let indexReady: Promise<string> | undefined;

/** Await the uniqueness guarantee before accepting an idempotent transaction. */
export function ensureTransactionIdempotencyIndex(db: Db) {
  if (!indexReady) {
    indexReady = db.collection('transactions').createIndex(
      { userId: 1, transactionRequestId: 1 },
      {
        name: 'transaction_request_unique',
        unique: true,
        partialFilterExpression: { transactionRequestId: { $type: 'string' } },
      },
    ).catch(error => {
      indexReady = undefined;
      throw error;
    });
  }
  return indexReady;
}
