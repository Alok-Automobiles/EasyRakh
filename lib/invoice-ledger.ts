import type { ClientSession, Db } from 'mongodb';
import { ObjectId } from 'mongodb';

type InvoiceLedgerLinks = {
  [key: string]: unknown;
  transactionId?: string;
  payments?: Array<{ ledgerTransactionId?: string }>;
};

export async function updateInvoiceLedgerBillAttachments(
  db: Db,
  userId: string,
  invoice: InvoiceLedgerLinks,
  billUrl: string,
  billPublicId: string,
  session?: ClientSession
) {
  const transactionIds = new Set<string>();

  if (invoice.transactionId && ObjectId.isValid(invoice.transactionId)) {
    transactionIds.add(invoice.transactionId);
  }
  for (const payment of invoice.payments || []) {
    if (payment.ledgerTransactionId && ObjectId.isValid(payment.ledgerTransactionId)) {
      transactionIds.add(payment.ledgerTransactionId);
    }
  }

  if (transactionIds.size === 0) return;

  await db.collection('transactions').updateMany(
    {
      _id: { $in: Array.from(transactionIds, (id) => new ObjectId(id)) },
      userId,
    },
    { $set: { billUrl, billPublicId } },
    { session }
  );
}
