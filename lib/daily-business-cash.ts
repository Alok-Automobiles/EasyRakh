import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ObjectId, type Document } from 'mongodb';
import { applyBusinessCashDelta, BusinessCashError, cashMoney, withBusinessCashTransaction } from './business-cash';
import { cashAmountSchema } from './business-cash-commands';
import { businessCashFailure, businessCashResponse } from './business-cash-http';
import { bumpCacheVersions } from './cache-version';

const entrySchema = z.object({
  amount: cashAmountSchema.refine(value => value > 0, 'Amount must be greater than zero'),
  type: z.enum(['in', 'out']), description: z.string().trim().min(1).max(2000),
  date: z.string().optional(),
  billUrl: z.union([z.literal(''), z.url().max(2048).refine(value => value.startsWith('https:'), 'Bill URL must use HTTPS')]).nullish(),
  billPublicId: z.string().max(512).nullish(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export function dailyBusinessDate(value?: string): Date {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const input = value ?? today;
  const iso = /^\d{2}-\d{2}-\d{4}$/.test(input) ? input.split('-').reverse().join('-') : input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new BusinessCashError('Date must use YYYY-MM-DD or DD-MM-YYYY', 400);
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new BusinessCashError('Invalid date', 400);
  if (iso > today) throw new BusinessCashError('Actual cash entries cannot have a future date', 400);
  return parsed;
}

const signed = (entry: { type: string; amount: number }) => entry.type === 'in' ? entry.amount : -entry.amount;
const totals = (entries: Document[]) => {
  const totalIn = cashMoney(entries.filter(e => e.type === 'in').reduce((sum, e) => sum + e.amount, 0));
  const totalOut = cashMoney(entries.filter(e => e.type === 'out').reduce((sum, e) => sum + e.amount, 0));
  return { totalIn, totalOut, totalLeft: cashMoney(totalIn - totalOut) };
};

function serialize(record: Document) {
  return { id: record._id.toString(), date: record.date.toISOString().slice(0, 10).split('-').reverse().join('-'),
    ...totals(record.entries), entries: record.entries.map((entry: Document) => ({
      id: entry._id.toString(), amount: entry.amount, type: entry.type, description: entry.description,
      billUrl: entry.billUrl || '', billPublicId: entry.billPublicId || '', source: entry.source || 'manual',
      invoiceId: entry.invoiceId, invoiceNumber: entry.invoiceNumber, paymentId: entry.paymentId,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    })) };
}

/** Enhanced branch only: legacy endpoints retain their old behavior when disabled. */
export async function mutateDailyBusinessCash(request: NextRequest, userId: string, method: 'POST' | 'PUT' | 'DELETE', entryId?: string) {
  try {
    if (method !== 'POST' && (!entryId || !ObjectId.isValid(entryId))) throw new BusinessCashError('Invalid entry ID', 400);
    const input = method === 'DELETE' ? null : entrySchema.parse(await request.json());
    const date = input ? dailyBusinessDate(input.date) : undefined;
    const newId = new ObjectId();
    const result = await withBusinessCashTransaction(userId, async (db, session) => {
      const collection = db.collection('dailyCashRecords');
      const now = new Date();
      if (method === 'POST') {
        const fingerprint = JSON.stringify({ amount: input!.amount, type: input!.type, description: input!.description,
          date: date!.toISOString(), billUrl: input!.billUrl || '', billPublicId: input!.billPublicId || '' });
        if (input!.idempotencyKey) {
          const replay = await collection.findOne({ userId, 'entries.idempotencyKey': input!.idempotencyKey }, { session });
          if (replay) {
            const prior = replay.entries.find((entry: Document) => entry.idempotencyKey === input!.idempotencyKey);
            if (prior.fingerprint !== fingerprint) throw new BusinessCashError('This request was already used for a different entry');
            return { record: serialize(replay), replayed: true };
          }
        }
        // The user document is the common mutex for all newly tracked cash writes.
        const marker = await applyBusinessCashDelta(db, userId, signed(input!), session);
        const record = await collection.findOne({ userId, date }, { session });
        const entry = { _id: newId, amount: input!.amount, type: input!.type, description: input!.description,
          billUrl: input!.billUrl || '', billPublicId: input!.billPublicId || '', source: 'manual',
          idempotencyKey: input!.idempotencyKey, fingerprint, ...marker, createdAt: now, updatedAt: now };
        const entries = [...(record?.entries ?? []), entry];
        const next = { ...(record ?? { _id: new ObjectId(), userId, date, createdAt: now }), entries, ...totals(entries), updatedAt: now };
        if (record) await collection.updateOne({ _id: record._id, userId }, { $set: { entries, ...totals(entries), updatedAt: now } }, { session });
        else await collection.insertOne(next, { session });
        return { record: serialize(next), replayed: false };
      }
      const record = await collection.findOne({ userId, 'entries._id': new ObjectId(entryId) }, { session });
      if (!record) throw new BusinessCashError('Entry not found', 404);
      const existing = record.entries.find((entry: Document) => entry._id.toString() === entryId);
      if (existing.source === 'invoice_payment') throw new BusinessCashError('Change invoice payment entries from the invoice payment history');
      if (method === 'PUT' && date!.getTime() !== record.date.getTime()) {
        throw new BusinessCashError('Use the original entry date when editing Daily Cash', 400);
      }
      const marker = await applyBusinessCashDelta(db, userId, (input ? signed(input) : 0) - signed(existing), session, existing);
      const entries = method === 'DELETE' ? record.entries.filter((entry: Document) => entry._id.toString() !== entryId)
        : record.entries.map((entry: Document) => entry._id.toString() !== entryId ? entry : {
          ...entry, amount: input!.amount, type: input!.type, description: input!.description,
          billUrl: input!.billUrl === undefined ? entry.billUrl : input!.billUrl || '',
          billPublicId: input!.billPublicId === undefined ? entry.billPublicId : input!.billPublicId || '',
          ...marker, updatedAt: now,
        });
      if (!entries.length) await collection.deleteOne({ _id: record._id, userId }, { session });
      else await collection.updateOne({ _id: record._id, userId }, { $set: { entries, ...totals(entries), updatedAt: now } }, { session });
      // Uploaded evidence is retained on deletion; it must never be removed before
      // the cash transaction commits, or by a retried Mongo transaction callback.
      return { record: entries.length ? serialize({ ...record, entries }) : null,
        deletedRecordId: entries.length ? undefined : record._id.toString(),
        date: record.date.toISOString().slice(0, 10).split('-').reverse().join('-') };
    });
    await bumpCacheVersions(userId, ['dailyCash', 'dashboard']);
    return businessCashResponse({ message: method === 'DELETE' ? 'Entry deleted successfully' : method === 'POST' ? 'Entry created successfully' : 'Entry updated successfully', ...result }, method === 'POST' && !('replayed' in result && result.replayed) ? 201 : 200);
  } catch (error) { return businessCashFailure(error); }
}
