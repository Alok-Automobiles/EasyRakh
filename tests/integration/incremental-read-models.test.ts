import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { emptyUserSummary, rebuildUserReadModels, syncAffectedReadModels } from '@/lib/read-models';

describe('incremental read models', () => {
  let replSet: MongoMemoryReplSet;
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.2.5' } });
    client = new MongoClient(replSet.getUri());
    await client.connect();
    db = client.db('incremental-read-models-test');
  }, 30000);

  afterAll(async () => {
    await client?.close();
    await replSet?.stop();
  });

  it('keeps customer balances and totals equal to a full rebuild after concurrent saves', async () => {
    const userId = 'customer-account';
    const customerId = new ObjectId();
    const entityId = customerId.toString();
    await db.collection('userSummaries').insertOne(emptyUserSummary(userId));
    await db.collection('customers').insertOne({
      _id: customerId, userId, name: 'Customer', openingBalance: 100,
      balanceType: 'debit', createdAt: new Date(),
    });
    await syncAffectedReadModels(db, userId, { entities: [{ entityType: 'customer', entityId }] });

    const transactions = [
      { userId, entityType: 'customer', entityId, type: 'credit', amount: 40, date: new Date(), createdAt: new Date() },
      { userId, entityType: 'customer', entityId, type: 'debit', amount: 15, date: new Date(), createdAt: new Date() },
    ];
    await db.collection('transactions').insertMany(transactions);
    await Promise.all([
      syncAffectedReadModels(db, userId, { entities: [{ entityType: 'customer', entityId }] }),
      syncAffectedReadModels(db, userId, { entities: [{ entityType: 'customer', entityId }] }),
    ]);

    const before = await db.collection('userSummaries').findOne({ userId });
    const balanceBefore = await db.collection('entityBalances').findOne({ userId, entityType: 'customer', entityId });
    const rebuilt = await rebuildUserReadModels(db, userId);
    const balanceAfter = await db.collection('entityBalances').findOne({ userId, entityType: 'customer', entityId });
    expect(before).toMatchObject({
      totalCustomers: 1, totalTransactions: 2, totalCredit: 40, totalDebit: 15,
      customerCredit: 40, customerDebit: 15, customerOpeningBalanceTotal: 100,
    });
    for (const field of ['totalCustomers', 'totalTransactions', 'totalCredit', 'totalDebit', 'customerCredit', 'customerDebit', 'customerOpeningBalanceTotal'] as const) {
      expect(before?.[field]).toBe(rebuilt[field]);
    }
    expect(balanceBefore).toMatchObject({ totalCredit: 40, totalDebit: 15, totalBalance: 75 });
    expect(balanceBefore?.totalBalance).toBe(balanceAfter?.totalBalance);
  });

  it('updates only the changed inventory contribution and removes unused facets', async () => {
    const userId = 'inventory-account';
    const itemId = new ObjectId();
    await db.collection('userSummaries').insertOne(emptyUserSummary(userId));
    await db.collection('inventory').insertOne({
      _id: itemId, userId, itemName: 'Part', quantity: 4, buyingPrice: 25,
      location: 'A', brand: 'B', supplier: 'C', createdAt: new Date(), updatedAt: new Date(),
    });
    await syncAffectedReadModels(db, userId, { inventoryItemIds: [itemId.toString()] });
    expect(await db.collection('userSummaries').findOne({ userId })).toMatchObject({
      inventory: { totalItems: 1, totalQuantity: 4, totalValue: 100, locations: ['A'], brands: ['B'], suppliers: ['C'] },
    });

    await db.collection('inventory').updateOne({ _id: itemId }, { $set: { quantity: 2, buyingPrice: 30, location: 'D' } });
    await syncAffectedReadModels(db, userId, { inventoryItemIds: [itemId.toString()] });
    const before = await db.collection('userSummaries').findOne({ userId });
    expect(before).toMatchObject({
      inventory: { totalItems: 1, totalQuantity: 2, totalValue: 60, locations: ['D'], brands: ['B'], suppliers: ['C'] },
    });
    const rebuilt = await rebuildUserReadModels(db, userId);
    expect(before?.inventory).toEqual(rebuilt.inventory);
  });
});
