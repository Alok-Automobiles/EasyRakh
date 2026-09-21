import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { ensureSupplierPaymentIndexes } from '@/lib/supplier-payment-indexes';
import { inspectSupplierPaymentSetup } from '@/scripts/setup-supplier-payments';

describe('supplier payment database readiness', () => {
  const client = new MongoClient(inject('supplierTestMongoUri'));
  let db: Db;

  beforeAll(async () => {
    await client.connect();
    db = client.db('supplier_setup_test');
  });
  afterAll(async () => { await client.close(); });

  it('runs on a real replica set and aborts multi-document writes', async () => {
    expect((await client.db('admin').command({ hello: 1 })).setName).toBeTruthy();
    const userId = new ObjectId().toHexString();
    const session = client.startSession();
    try {
      await expect(session.withTransaction(async () => {
        await db.collection('users').insertOne({ userId, businessCash: { currentBalance: 900 } }, { session });
        await db.collection('transactions').insertOne({ userId, amount: 100 }, { session });
        throw new Error('Injected payment failure');
      })).rejects.toThrow('Injected payment failure');
      expect(await db.collection('users').countDocuments({ userId })).toBe(0);
      expect(await db.collection('transactions').countDocuments({ userId })).toBe(0);
    } finally { await session.endSession(); }
  });

  it('leaves legacy duplicate invoice numbers alone and enforces tracked invoices per supplier', async () => {
    await ensureSupplierPaymentIndexes(db);
    await ensureSupplierPaymentIndexes(db);
    const base = { userId: 'index-owner', entityId: 'supplier-1', entityType: 'supplier', type: 'credit', invoiceNumber: 'A-1', amount: 100 };
    await db.collection('transactions').insertMany([{ ...base }, { ...base }]);
    const tracked = { ...base, billStatus: 'unpaid', paidAmount: 0, discountReceived: 0, pendingAmount: 100 };
    await db.collection('transactions').insertOne({ ...tracked });
    await expect(db.collection('transactions').insertOne({ ...tracked })).rejects.toMatchObject({ code: 11000 });
    await db.collection('transactions').insertOne({ ...tracked, entityId: 'supplier-2' });
    await db.collection('transactions').insertOne({ ...tracked, userId: 'another-owner' });
  });

  it('enforces request idempotency only for new structured transactions', async () => {
    const base = { userId: 'idempotency-owner', entityId: 'supplier-1', entityType: 'supplier', type: 'debit', amount: 100 };
    await db.collection('transactions').insertMany([{ ...base }, { ...base }]);
    await db.collection('transactions').insertOne({ ...base, supplierPaymentRequestId: 'request-1' });
    await expect(db.collection('transactions').insertOne({ ...base, supplierPaymentRequestId: 'request-1' })).rejects.toMatchObject({ code: 11000 });
    await db.collection('transactions').insertOne({ ...base, userId: 'another-owner', supplierPaymentRequestId: 'request-1' });
  });

  it('read-only checks find damaged allocation ownership and invalid pending amounts without changing records', async () => {
    const damagedDb = client.db('supplier_damaged_test');
    const billId = new ObjectId();
    await damagedDb.collection('transactions').insertMany([
      { _id: billId, userId: 'owner-1', entityId: 'supplier-1', entityType: 'supplier', type: 'credit', amount: 100, paidAmount: 20, pendingAmount: 90, billStatus: 'partial' },
      { userId: 'owner-2', entityId: 'supplier-1', entityType: 'supplier', type: 'debit', amount: 20, cashPaidAmount: 20,
        paymentAllocations: [{ billTransactionId: billId.toHexString(), cashAmount: 20, discountAmount: 0, settledAmount: 20 }] },
    ]);
    const before = await damagedDb.collection('transactions').find().toArray();
    const checks = await inspectSupplierPaymentSetup(damagedDb);
    expect(checks.find((check) => check.name === 'invalid_tracked_bill_totals')?.count).toBe(1);
    expect(checks.find((check) => check.name === 'broken_or_cross_supplier_allocations')?.count).toBe(1);
    expect(await damagedDb.collection('transactions').find().toArray()).toEqual(before);
    expect(await damagedDb.listCollections().toArray()).toHaveLength(1);
  });

  it('read-only readiness reports missing indexes without creating collections or indexes', async () => {
    const emptyDb = client.db('supplier_empty_read_only_test');
    const checks = await inspectSupplierPaymentSetup(emptyDb);
    expect(checks.filter(check => check.name.startsWith('missing_index:')).every(check => check.count === 1)).toBe(true);
    expect(checks.filter(check => check.blocking).every(check => check.count === 0)).toBe(true);
    expect(await emptyDb.listCollections().toArray()).toEqual([]);
  });

  it('read-only readiness detects legacy payments that overlap tracked bills and expired ISO reservations', async () => {
    const pausedDb = client.db('supplier_paused_read_only_test');
    const supplierId = new ObjectId();
    await pausedDb.collection('suppliers').insertOne({ _id: supplierId, userId: 'paused-owner', name: 'Paused supplier', openingBalance: 0, balanceType: 'credit' });
    await pausedDb.collection('transactions').insertMany([
      { userId: 'paused-owner', entityId: supplierId.toHexString(), entityType: 'supplier', type: 'credit', amount: 100,
        paidAmount: 0, pendingAmount: 100, billStatus: 'unpaid', invoiceNumber: 'PAUSED-1', invoiceDate: '2020-01-01', dueDate: '2020-01-02',
        reservationStatus: 'active', reservationExpiresAt: '2020-01-02T18:30:00.000Z', reservedAmount: 10 },
      { userId: 'paused-owner', entityId: supplierId.toHexString(), entityType: 'supplier', type: 'debit', amount: 20 },
    ]);
    const checks = await inspectSupplierPaymentSetup(pausedDb);
    expect(checks.find(check => check.name === 'supplier_ledger_allocation_issues')).toMatchObject({ count: 1, blocking: true });
    expect(checks.find(check => check.name === 'expired_bill_reservations')?.count).toBe(1);
    expect((await pausedDb.collection('transactions').findOne({ type: 'credit' }))!.pendingAmount).toBe(100);
  });
});
