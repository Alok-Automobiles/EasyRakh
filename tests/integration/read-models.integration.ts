import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { rebuildUserReadModels, refreshUserReadModels } from '@/lib/read-models';

describe('targeted read models on a real replica set', () => {
  const client = new MongoClient(inject('supplierTestMongoUri'), { monitorCommands: true });
  let db: Db;
  const benchmarks: unknown[] = [];
  beforeAll(async () => {
    await client.connect();
    db = client.db('read_model_performance');
    await db.collection('userSummaries').createIndex({ userId: 1 }, { unique: true });
    await db.collection('entityBalances').createIndex({ userId: 1, entityType: 1, entityId: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ userId: 1, entityId: 1, entityType: 1 });
    await db.collection('transactions').createIndex({ userId: 1, customerId: 1 });
    await db.collection('transactions').createIndex({ userId: 1, supplierId: 1 });
    await db.collection('inventory').createIndex({ userId: 1 });
  });
  afterAll(async () => {
    await client.close();
    mkdirSync('test-results/performance', { recursive: true });
    writeFileSync('test-results/performance/database.json', JSON.stringify(benchmarks, null, 2));
  });

  async function fixture(size = 10) {
    const userId = new ObjectId().toHexString();
    const customer = new ObjectId();
    const supplier = new ObjectId();
    await db.collection('users').insertOne({ _id: new ObjectId(userId) });
    await db.collection('customers').insertOne({ _id: customer, userId, name: 'Customer', openingBalance: 100, balanceType: 'debit' });
    await db.collection('suppliers').insertOne({ _id: supplier, userId, name: 'Supplier', openingBalance: 50, balanceType: 'credit' });
    await db.collection('transactions').insertMany(Array.from({ length: size }, (_, i) => ({
      userId, entityType: i % 2 ? 'customer' : 'supplier',
      entityId: (i % 2 ? customer : supplier).toHexString(),
      type: i % 3 ? 'debit' : 'credit', amount: i + 1, date: new Date(2026, 0, i + 1),
    })));
    await rebuildUserReadModels(db, userId);
    return { userId, customer, supplier };
  }

  function comparable<T>(value: T): unknown {
    return JSON.parse(JSON.stringify(value, (key, item) =>
      ['_id', 'updatedAt', 'createdAt'].includes(key) ? undefined : item));
  }

  async function expectMatchesRebuild(userId: string) {
    const summary = await db.collection('userSummaries').findOne({ userId });
    const balances = await db.collection('entityBalances').find({ userId }).sort({ entityType: 1, entityId: 1 }).toArray();
    const rebuilt = await rebuildUserReadModels(db, userId);
    expect(comparable(summary)).toEqual(comparable(rebuilt));
    expect(comparable(balances)).toEqual(comparable(await db.collection('entityBalances').find({ userId }).sort({ entityType: 1, entityId: 1 }).toArray()));
  }

  it('handles concurrent refreshes, repeated requests, legacy records, and entity moves', async () => {
    const { userId, customer, supplier } = await fixture();
    const entities = [{ entityType: 'customer', entityId: customer.toHexString() }, { entityType: 'supplier', entityId: supplier.toHexString() }];
    await db.collection('transactions').insertOne({ userId, customerId: customer.toHexString(), type: 'credit', amount: 77, date: new Date() });
    const moved = await db.collection('transactions').findOne({ userId, entityType: 'supplier' });
    await db.collection('transactions').updateOne({ _id: moved!._id }, { $set: { entityType: 'customer', entityId: customer.toHexString() } });
    await db.collection('customers').updateOne({ _id: customer }, { $set: { openingBalance: 350, name: 'Renamed' } });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      refreshUserReadModels(db, userId, { entities: i % 2 ? entities : [...entities].reverse() })));
    expect(results.every(Boolean)).toBe(true);
    await expectMatchesRebuild(userId);
  });

  it('handles creation, deletion, and custom collection changes without rewriting unrelated balances', async () => {
    const { userId, customer, supplier } = await fixture();
    const untouched = await db.collection('entityBalances').findOne({ userId, entityType: 'supplier' });
    const customId = new ObjectId();
    await db.collection('customEntities').insertOne({ _id: customId, userId, collectionType: 'old-type', name: 'Custom', openingBalance: 25 });
    await refreshUserReadModels(db, userId, { entities: [{ entityType: 'old-type', entityId: customId.toHexString() }] });
    await db.collection('customEntities').updateOne({ _id: customId }, { $set: { collectionType: 'new-type' } });
    await db.collection('customers').deleteOne({ _id: customer });
    await db.collection('transactions').deleteMany({ userId, entityId: customer.toHexString() });
    expect(await refreshUserReadModels(db, userId, { entities: [
      { entityType: 'customer', entityId: customer.toHexString() },
      { entityType: 'old-type', entityId: customId.toHexString() },
      { entityType: 'new-type', entityId: customId.toHexString() },
    ] })).not.toBeNull();
    expect(await db.collection('entityBalances').findOne({ userId, entityId: supplier.toHexString() })).toEqual(untouched);
    await expectMatchesRebuild(userId);
  });

  it('recomputes stock totals and labels including negative stock and inactive items', async () => {
    const { userId } = await fixture();
    await db.collection('inventory').insertMany([
      { userId, quantity: 5, buyingPrice: 30, brand: 'A', location: 'Shelf', supplier: 'S' },
      { userId, quantity: 0, createdAt: new Date() },
      { userId, quantity: -1, buyingPrice: 10 },
      { userId, quantity: 100, buyingPrice: 2, brand: 'B' },
    ]);
    expect(await refreshUserReadModels(db, userId, { inventory: true })).not.toBeNull();
    await expectMatchesRebuild(userId);
    await db.collection('inventory').deleteMany({ userId });
    await refreshUserReadModels(db, userId, { inventory: true });
    await expectMatchesRebuild(userId);
  });

  it('initializes missing summaries atomically under concurrent requests', async () => {
    const { userId, customer } = await fixture();
    await db.collection('userSummaries').deleteOne({ userId });
    const results = await Promise.all(Array.from({ length: 3 }, () => refreshUserReadModels(db, userId, {
      entities: [{ entityType: 'customer', entityId: customer.toHexString() }],
    })));
    expect(results.every(Boolean)).toBe(true);
    await expectMatchesRebuild(userId);
  });

  it('rolls back balance changes when refresh fails and safely retries', async () => {
    const { userId, customer } = await fixture();
    const before = await db.collection('entityBalances').findOne({ userId, entityId: customer.toHexString() });
    await db.collection('transactions').insertOne({ userId, entityType: 'customer', entityId: customer.toHexString(), type: 'debit', amount: 999 });
    const warning = console.warn;
    console.warn = () => {};
    try {
      expect(await refreshUserReadModels(db, userId, { entities: [
        { entityType: 'customer', entityId: customer.toHexString() },
        { entityType: 'supplier', entityId: 'invalid-object-id' },
      ] })).toBeNull();
    } finally { console.warn = warning; }
    expect(await db.collection('entityBalances').findOne({ userId, entityId: customer.toHexString() })).toEqual(before);
    expect(await refreshUserReadModels(db, userId, { entities: [{ entityType: 'customer', entityId: customer.toHexString() }] })).not.toBeNull();
    await expectMatchesRebuild(userId);
  });

  it('benchmarks small and large accounts and checks targeted database access', async () => {
    for (const size of [20, 5_000]) {
      const { userId, customer } = await fixture(size);
      // Most history belongs to unrelated entities; one balance should remain cheap.
      await db.collection('transactions').updateMany({ userId, entityType: 'supplier' }, { $set: { entityId: new ObjectId().toHexString() } });
      await rebuildUserReadModels(db, userId);
      const full: number[] = [];
      const targeted: number[] = [];
      for (let i = 0; i < 3; i++) {
        let start = performance.now();
        await rebuildUserReadModels(db, userId);
        full.push(performance.now() - start);
        start = performance.now();
        expect(await refreshUserReadModels(db, userId, { entities: [{ entityType: 'customer', entityId: customer.toHexString() }] })).not.toBeNull();
        targeted.push(performance.now() - start);
      }
      // Timing is diagnostic, never a flaky wall-clock assertion.
      benchmarks.push({ transactions: size,
        rebuildMedianMs: full.sort((a, b) => a - b)[1], targetedMedianMs: targeted.sort((a, b) => a - b)[1] });
      const collections: string[] = [];
      const listener = (event: { commandName: string; command: Record<string, unknown> }) => {
        if (event.commandName === 'find' || event.commandName === 'aggregate') collections.push(String(event.command[event.commandName]));
      };
      client.on('commandStarted', listener);
      try { await refreshUserReadModels(db, userId, { entities: [{ entityType: 'customer', entityId: customer.toHexString() }] }); }
      finally { client.off('commandStarted', listener); }
      expect(collections).not.toContain('inventory');
      expect(collections).not.toContain('suppliers');
      expect(collections).not.toContain('customEntities');
      await expectMatchesRebuild(userId);
    }
  });
});
