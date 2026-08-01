import { ClientSession, Db, ObjectId } from 'mongodb';
import { roundMoney } from './invoice-calculations';
import type { InvoicePayment } from './types';

export type InvoiceCashEntryInput = {
  entryId: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  date: Date;
  customerName: string;
  billUrl?: string;
  billPublicId?: string;
};

export function normalizeCashDate(date: Date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ));
}

export function parseDateOnly(value?: string, label = 'Date') {
  if (!value) return normalizeCashDate(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} must use YYYY-MM-DD format`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`${label} is invalid`);
  }
  return date;
}

function dateInputValueInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function parseInvoiceDate(value?: string, now = new Date()) {
  const today = dateInputValueInTimeZone(now, 'Asia/Kolkata');
  const dateValue = value || today;
  const date = parseDateOnly(dateValue, 'Invoice date');
  if (dateValue > today) {
    throw new Error('Invoice date cannot be in the future');
  }
  return date;
}

export function parsePaymentDate(value?: string) {
  return parseDateOnly(value, 'Payment date');
}

export function reconcileInvoicePaymentHistory(invoice: Record<string, unknown>) {
  const payments: InvoicePayment[] = Array.isArray(invoice.payments)
    ? [...invoice.payments] as InvoicePayment[]
    : [];
  const trackedAmount = roundMoney(payments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0));
  const recordedPaidAmount = roundMoney(Math.max(0, Number(invoice.paidAmount || 0)));
  let changed = false;

  if (trackedAmount < recordedPaidAmount) {
    const now = new Date();
    const legacyDate = invoice.createdAt
      ? new Date(invoice.createdAt as Date | string)
      : now;
    payments.unshift({
      id: new ObjectId().toString(),
      amount: roundMoney(recordedPaidAmount - trackedAmount),
      date: Number.isFinite(legacyDate.getTime()) ? legacyDate : now,
      source: 'legacy',
      createdAt: Number.isFinite(legacyDate.getTime()) ? legacyDate : now,
      updatedAt: now,
    });
    changed = true;
  }

  return {
    payments,
    paidAmount: roundMoney(Math.max(recordedPaidAmount, trackedAmount)),
    changed,
  };
}

function totals(entries: Array<{ type: 'in' | 'out'; amount: number }>) {
  const totalIn = roundMoney(entries.filter((entry) => entry.type === 'in').reduce((sum, entry) => sum + entry.amount, 0));
  const totalOut = roundMoney(entries.filter((entry) => entry.type === 'out').reduce((sum, entry) => sum + entry.amount, 0));
  return { totalIn, totalOut, totalLeft: roundMoney(totalIn - totalOut) };
}

async function saveEntries(
  db: Db,
  userId: string,
  record: any,
  entries: any[],
  session: ClientSession
) {
  const collection = db.collection('dailyCashRecords');
  if (entries.length === 0) {
    await collection.deleteOne({ _id: record._id, userId }, { session });
    return;
  }
  await collection.updateOne(
    { _id: record._id, userId },
    { $set: { entries, ...totals(entries), updatedAt: new Date() } },
    { session }
  );
}

export async function addInvoicePaymentCashEntry(
  db: Db,
  userId: string,
  input: InvoiceCashEntryInput,
  session: ClientSession
) {
  const collection = db.collection('dailyCashRecords');
  const existingPayment = await collection.findOne(
    { userId, 'entries.paymentId': input.paymentId },
    { session }
  );
  if (existingPayment) {
    return input.entryId;
  }

  const date = normalizeCashDate(input.date);
  const record = await collection.findOne({ userId, date }, { session });
  const now = new Date();
  const entry = {
    _id: new ObjectId(input.entryId),
    amount: roundMoney(input.amount),
    type: 'in' as const,
    description: `Invoice ${input.invoiceNumber} - Payment received from ${input.customerName}`,
    source: 'invoice_payment',
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    paymentId: input.paymentId,
    billUrl: input.billUrl || '',
    billPublicId: input.billPublicId || '',
    createdAt: now,
    updatedAt: now,
  };

  if (!record) {
    await collection.insertOne({
      userId,
      date,
      entries: [entry],
      totalIn: entry.amount,
      totalOut: 0,
      totalLeft: entry.amount,
      createdAt: now,
      updatedAt: now,
    }, { session });
  } else {
    const entries = [...(record.entries || []), entry];
    await saveEntries(db, userId, record, entries, session);
  }

  return input.entryId;
}

export async function removeInvoicePaymentCashEntry(
  db: Db,
  userId: string,
  paymentId: string,
  session: ClientSession
) {
  const collection = db.collection('dailyCashRecords');
  const record = await collection.findOne({ userId, 'entries.paymentId': paymentId }, { session });
  if (!record) return;
  const entries = (record.entries || []).filter((entry: any) => entry.paymentId !== paymentId);
  await saveEntries(db, userId, record, entries, session);
}

export async function replaceInvoicePaymentCashEntry(
  db: Db,
  userId: string,
  input: InvoiceCashEntryInput,
  session: ClientSession
) {
  await removeInvoicePaymentCashEntry(db, userId, input.paymentId, session);
  await addInvoicePaymentCashEntry(db, userId, input, session);
}

export async function removeInvoiceCashEntries(
  db: Db,
  userId: string,
  invoiceId: string,
  session: ClientSession
) {
  const collection = db.collection('dailyCashRecords');
  const records = await collection.find({ userId, 'entries.invoiceId': invoiceId }, { session }).toArray();
  for (const record of records) {
    const entries = (record.entries || []).filter((entry: any) => entry.invoiceId !== invoiceId);
    await saveEntries(db, userId, record, entries, session);
  }
}

export async function updateInvoiceCashEntryBills(
  db: Db,
  userId: string,
  invoiceId: string,
  billUrl: string,
  billPublicId: string,
  session: ClientSession
) {
  await db.collection('dailyCashRecords').updateMany(
    { userId, 'entries.invoiceId': invoiceId },
    {
      $set: {
        'entries.$[entry].billUrl': billUrl,
        'entries.$[entry].billPublicId': billPublicId,
        'entries.$[entry].updatedAt': new Date(),
      },
    },
    { arrayFilters: [{ 'entry.invoiceId': invoiceId }], session }
  );
}
