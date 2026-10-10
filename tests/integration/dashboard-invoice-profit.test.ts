import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  combineInvoiceProfitViews,
  legacyInvoiceProfitQuery,
  storedInvoiceProfitPipeline,
  type StoredInvoiceProfitTotals,
} from '@/lib/dashboard-invoice-profit';
import { calculateInvoiceProfitViews } from '@/lib/invoice-calculations';
import type { Invoice } from '@/lib/types';

describe('dashboard invoice profit aggregation', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ binary: { version: '8.2.5' } });
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('dashboard-profit-test');
  }, 30000);

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });

  it('matches the legacy calculation while including only the selected business-date period', async () => {
    const userId = 'account-1';
    const otherUserId = 'account-2';
    const inPeriod = new Date('2026-06-15T00:00:00.000Z');
    const outOfPeriod = new Date('2026-07-01T00:00:00.000Z');
    const invoices: Array<Partial<Omit<Invoice, '_id'>> & { userId: string; createdAt: Date }> = [
      {
        userId,
        invoiceDate: inPeriod,
        createdAt: outOfPeriod,
        status: 'paid',
        totalAmount: 100,
        totalCogs: 50,
        costedSales: 80,
        uncostedSales: 20,
        missingCostItemCount: 1,
        items: [],
      },
      {
        userId,
        invoiceDate: inPeriod,
        createdAt: inPeriod,
        status: 'unpaid',
        totalAmount: 50,
        totalCogs: 30,
        costedSales: 50,
        uncostedSales: 0,
        missingCostItemCount: 0,
        items: [],
      },
      {
        userId,
        createdAt: inPeriod,
        status: 'paid',
        totalAmount: 60,
        items: [{ itemName: 'Legacy item', quantity: 2, amount: 60, cogs: 40 }],
      },
    ];
    await db.collection('invoices').insertMany([
      ...invoices,
      { ...invoices[0], userId: otherUserId },
      { ...invoices[1], invoiceDate: outOfPeriod },
    ]);

    const periodQuery = {
      userId,
      $or: [
        { invoiceDate: { $gte: new Date('2026-06-01'), $lt: outOfPeriod } },
        { invoiceDate: { $exists: false }, createdAt: { $gte: new Date('2026-06-01'), $lt: outOfPeriod } },
      ],
    };
    const [stored] = await db.collection('invoices')
      .aggregate<StoredInvoiceProfitTotals>(storedInvoiceProfitPipeline(periodQuery))
      .toArray();
    const legacy = await db.collection<Omit<Invoice, '_id'>>('invoices')
      .find(legacyInvoiceProfitQuery(periodQuery))
      .toArray();

    expect(legacy).toHaveLength(1);
    expect(combineInvoiceProfitViews(stored, legacy)).toEqual(
      calculateInvoiceProfitViews(invoices)
    );
  });
});
