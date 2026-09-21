import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { ensureSupplierPaymentIndexes } from '@/lib/supplier-payment-indexes';
import { indiaDate } from '@/lib/supplier-payments-rules';

// Only identity extraction and external cache/attachment services are replaced.
// Every API, validation, calculation, session and database write is real.
vi.mock('@/lib/auth', () => ({ getUserIdFromRequest: (request: NextRequest) => request.headers.get('x-test-user') }));
vi.mock('@/lib/redis', () => ({ default: {
  get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), setex: vi.fn(async () => 'OK'),
  del: vi.fn(async () => 1), incr: vi.fn(async () => 1),
} }));
vi.mock('@/lib/cache-version', () => ({
  bumpCacheVersions: vi.fn(async () => undefined),
  getCacheVersion: vi.fn(async () => '0'), getCacheVersions: vi.fn(async () => ({})),
}));
vi.mock('@/lib/cloudinary-cleanup', () => ({
  cloudinaryAssetsFromFields: vi.fn(() => []),
  deleteCloudinaryAssets: vi.fn(async () => undefined),
  deleteCloudinaryAsset: vi.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>; // API boundary payloads, asserted below.

describe('supplier payments with the existing ledger and Daily Cash APIs', () => {
  const client = new MongoClient(inject('supplierTestMongoUri'));
  let db: Db;
  let userId: string;
  let supplierId: string;
  const today = indiaDate();

  const request = (path: string, body?: unknown, method = 'POST', user = userId) => new NextRequest(`http://localhost${path}`, {
    method, headers: { 'x-test-user': user, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cash = async () => (await db.collection('users').findOne({ _id: new ObjectId(userId) }))!.businessCash;
  const assertResponse = async (response: Response, status = 201): Promise<Json> => {
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(status);
    return body;
  };
  const open = async (currentBalance = 100_000, protectedAmount = 20_000) => {
    const { POST } = await import('@/app/api/business-cash/route');
    return assertResponse(await POST(request('/api/business-cash', { currentBalance, protectedAmount, idempotencyKey: randomUUID() })));
  };
  const bill = async (amount = 50_000, extra: Json = {}) => {
    const { POST } = await import('@/app/api/transactions/route');
    const result = await assertResponse(await POST(request('/api/transactions', {
      entityType: 'supplier', entityId: supplierId, type: 'credit', amount,
      invoiceNumber: randomUUID(), invoiceDate: today, dueDate: today, date: today,
      requestId: randomUUID(), ...extra,
    })));
    return result.transaction as Json;
  };
  const summary = async () => {
    const { GET } = await import('@/app/api/supplier-payments/route');
    return assertResponse(await GET(request('/api/supplier-payments', undefined, 'GET')), 200);
  };
  const payBody = async (billId: string, cashAmount: number, discountAmount = 0): Promise<Json> => ({
    supplierId, paymentAllocations: [{ billTransactionId: billId, cashAmount, discountAmount }],
    date: today, requestId: randomUUID(), expectedVersion: (await cash()).version,
  });
  const daily = async (amount: number, type: 'in' | 'out', idempotencyKey = randomUUID()) => {
    const { POST } = await import('@/app/api/daily-cash-records/route');
    return POST(request('/api/daily-cash-records', { amount, type, description: 'Actual daily movement', date: today, idempotencyKey }));
  };

  beforeAll(async () => {
    await client.connect();
    db = client.db('ledger');
    await ensureSupplierPaymentIndexes(db);
  });
  beforeEach(async () => {
    process.env.SUPPLIER_PAYMENTS_ENABLED = 'true';
    process.env.SUPPLIER_PAYMENTS_EPOCH = 'integration-first-enable';
    userId = new ObjectId().toHexString();
    supplierId = new ObjectId().toHexString();
    await db.collection('users').insertOne({ _id: new ObjectId(userId), email: `${userId}@local.test`, name: 'Local test owner' });
    await db.collection('suppliers').insertOne({ _id: new ObjectId(supplierId), userId, name: 'Local supplier', openingBalance: 0, balanceType: 'credit' });
  });
  afterAll(async () => {
    const { default: appClient } = await import('@/lib/mongodb');
    await (await appClient).close();
    await client.close();
  });

  it('initializes once; a credit bill reserves cash without creating payment or reducing business balance', async () => {
    await open();
    const created = await bill();
    expect((await cash()).currentBalance).toBe(100_000);
    const { POST } = await import('@/app/api/supplier-payments/reserve/route');
    await assertResponse(await POST(request('/api/supplier-payments/reserve', {
      supplierId, billTransactionId: created.id, amount: 20_000,
      recommendationReason: 'Invoice is due today.', expectedVersion: (await cash()).version, requestId: randomUUID(),
    })), 200);
    const result = await summary();
    expect(result.summary).toMatchObject({ currentBalance: 100_000, protectedAmount: 20_000, reservedAmount: 20_000, availableAmount: 60_000, dailySupplierPayments: 0 });
    expect(result.reservations[0]).toMatchObject({ amount: 20_000, reason: 'Invoice is due today.' });
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(0);
    expect(await db.collection('dailyCashRecords').countDocuments({ userId })).toBe(0);
    expect(await db.collection('businessBalanceAdjustments').countDocuments({ userId, kind: 'opening' })).toBe(1);
    expect(await db.collection('transactions').findOne({ _id: new ObjectId(created.id) })).toMatchObject({ recommendationReason: 'Invoice is due today.' });
  });

  it('full discount settles the ledger by ₹50,000 while cash falls only ₹48,750; retry cannot pay twice', async () => {
    await open();
    const created = await bill(50_000, { cashDiscountPercentage: 2.5, cashDiscountLastDate: today });
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    const body = await payBody(created.id, 48_750, 1_250);
    const first = await assertResponse(await POST(request('/api/supplier-payments/pay', body)));
    const replay = await assertResponse(await POST(request('/api/supplier-payments/pay', body)));
    expect(replay.transaction.id).toBe(first.transaction.id);
    expect(first.transaction).toMatchObject({ amount: 50_000, cashPaidAmount: 48_750, cashDiscountAmount: 1_250 });
    expect((await cash()).currentBalance).toBe(51_250);
    expect(await db.collection('transactions').findOne({ _id: new ObjectId(created.id) })).toMatchObject({ paidAmount: 48_750, discountReceived: 1_250, pendingAmount: 0, billStatus: 'paid' });
    const result = await summary();
    expect(result.suppliers[0].totalDue).toBe(0);
    expect(result.summary.dailySupplierPayments).toBe(48_750);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(1);
    expect(await db.collection('dailyCashRecords').countDocuments({ userId })).toBe(0);
  });

  it('tracks actual Daily Cash in/out once while keeping supplier payment out of Daily Cash totals', async () => {
    await open();
    const created = await bill();
    const receiptId = randomUUID();
    await assertResponse(await daily(10_000, 'in', receiptId));
    await assertResponse(await daily(10_000, 'in', receiptId), 200);
    await assertResponse(await daily(3_000, 'out'));
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    await assertResponse(await POST(request('/api/supplier-payments/pay', await payBody(created.id, 20_000))));
    expect((await cash()).currentBalance).toBe(87_000);
    const record = await db.collection('dailyCashRecords').findOne({ userId });
    expect(record).toMatchObject({ totalIn: 10_000, totalOut: 3_000, totalLeft: 7_000 });
    expect(record!.entries).toHaveLength(2);
    expect((await summary()).summary.dailySupplierPayments).toBe(20_000);
  });

  it('requires invoice terms for every new supplier purchase while enabled', async () => {
    await open();
    const { POST } = await import('@/app/api/transactions/route');
    await assertResponse(await POST(request('/api/transactions', {
      entityType: 'supplier', entityId: supplierId, type: 'credit', amount: 5_000, date: today,
    })), 400);
    expect(await db.collection('transactions').countDocuments({ userId })).toBe(0);
    expect((await cash()).currentBalance).toBe(100_000);
  });

  it('rejects a future invoice date without changing supplier dues or business cash', async () => {
    await open();
    const tomorrow = indiaDate(new Date(Date.now() + 86400000));
    const { POST } = await import('@/app/api/transactions/route');
    await assertResponse(await POST(request('/api/transactions', {
      entityType: 'supplier', entityId: supplierId, type: 'credit', amount: 5_000,
      invoiceNumber: randomUUID(), invoiceDate: tomorrow, dueDate: tomorrow, date: tomorrow,
      requestId: randomUUID(),
    })), 400);
    expect(await db.collection('transactions').countDocuments({ userId })).toBe(0);
    expect((await cash()).currentBalance).toBe(100_000);
  });

  it('rejects discount on partial settlement and atomically preserves all totals', async () => {
    await open();
    const created = await bill(50_000, { cashDiscountPercentage: 2.5, cashDiscountLastDate: today });
    const before = await cash();
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    await assertResponse(await POST(request('/api/supplier-payments/pay', await payBody(created.id, 10_000, 1_250))), 400);
    expect(await cash()).toEqual(before);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(0);
    expect((await db.collection('transactions').findOne({ _id: new ObjectId(created.id) }))!.pendingAmount).toBe(50_000);
  });

  it('serializes simultaneous reservations so two callers cannot spend the same available cash', async () => {
    await open(10_000, 1_000);
    const a = await bill(8_000);
    const b = await bill(8_000);
    const version = (await cash()).version;
    const { POST } = await import('@/app/api/supplier-payments/reserve/route');
    const responses = await Promise.all([a, b].map(created => POST(request('/api/supplier-payments/reserve', {
      supplierId, billTransactionId: created.id, amount: 8_000, expectedVersion: version, requestId: randomUUID(),
    }))));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await summary()).summary).toMatchObject({ currentBalance: 10_000, reservedAmount: 8_000, availableAmount: 1_000 });
  });

  it('serializes concurrent copies of the same payment into one debit and one cash decrement', async () => {
    await open();
    const created = await bill();
    const body = await payBody(created.id, 20_000);
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    const responses = await Promise.all([POST(request('/api/supplier-payments/pay', body)), POST(request('/api/supplier-payments/pay', body))]);
    for (const response of responses) await assertResponse(response);
    expect((await cash()).currentBalance).toBe(80_000);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(1);
  });

  it('rejects a payment using protected funds or another bill reservation', async () => {
    await open(50_000, 20_000);
    const a = await bill(40_000);
    const b = await bill(20_000);
    const reserve = await import('@/app/api/supplier-payments/reserve/route');
    await assertResponse(await reserve.POST(request('/api/supplier-payments/reserve', {
      supplierId, billTransactionId: b.id, amount: 20_000, expectedVersion: (await cash()).version, requestId: randomUUID(),
    })), 200);
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    await assertResponse(await POST(request('/api/supplier-payments/pay', await payBody(a.id, 15_000))), 409);
    expect((await cash()).currentBalance).toBe(50_000);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(0);
  });

  it('refuses cross-owner bill allocations even with a valid target supplier', async () => {
    await open();
    const created = await bill();
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    const body = await payBody(created.id, 1_000);
    await assertResponse(await POST(request('/api/supplier-payments/pay', body, 'POST', new ObjectId().toHexString())), 409);
    expect((await cash()).currentBalance).toBe(100_000);
  });

  it('keeps legacy additions usable when disabled and protects structured records from old edit/delete paths', async () => {
    await open();
    const created = await bill();
    const before = await cash();
    process.env.SUPPLIER_PAYMENTS_ENABLED = 'false';
    await assertResponse(await daily(500, 'out'));
    expect(await cash()).toEqual(before);
    const { PUT, DELETE } = await import('@/app/api/transactions/[id]/route');
    await assertResponse(await PUT(request(`/api/transactions/${created.id}`, {
      entityType: 'supplier', entityId: supplierId, type: 'credit', amount: 50_000,
      invoiceNumber: created.invoiceNumber, invoiceDate: today, dueDate: today, date: today,
    }, 'PUT'), { params: Promise.resolve({ id: created.id }) }), 409);
    await assertResponse(await DELETE(request(`/api/transactions/${created.id}`, undefined, 'DELETE'), { params: Promise.resolve({ id: created.id }) }), 409);
    expect(await db.collection('transactions').findOne({ _id: new ObjectId(created.id) })).not.toBeNull();
    const { POST } = await import('@/app/api/transactions/route');
    await assertResponse(await POST(request('/api/transactions', { entityType: 'supplier', entityId: supplierId, type: 'debit', amount: 500, date: today })));
    await assertResponse(await POST(request('/api/transactions', { entityType: 'supplier', entityId: supplierId, type: 'credit', amount: 700, date: today })));
    expect(await db.collection('dailyCashRecords').findOne({ userId })).toMatchObject({ totalOut: 500 });
    expect(await db.collection('transactions').countDocuments({ userId })).toBe(3);
    const supplierRoute = await import('@/app/api/suppliers/[id]/route');
    await assertResponse(await supplierRoute.DELETE(request(`/api/suppliers/${supplierId}`, undefined, 'DELETE'), { params: Promise.resolve({ id: supplierId }) }), 409);
    expect(await cash()).toEqual(before);
  });

  it('requires fresh cash confirmation after reenable epoch changes and clears stale reservations', async () => {
    await open();
    const created = await bill();
    const reserve = await import('@/app/api/supplier-payments/reserve/route');
    await assertResponse(await reserve.POST(request('/api/supplier-payments/reserve', {
      supplierId, billTransactionId: created.id, amount: 20_000, expectedVersion: (await cash()).version, requestId: randomUUID(),
    })), 200);
    process.env.SUPPLIER_PAYMENTS_EPOCH = 'integration-reenabled';
    expect((await summary()).businessCash.needsReconciliation).toBe(true);
    expect((await summary()).recommendations).toEqual([]);
    const { POST } = await import('@/app/api/business-cash/reconcile/route');
    await assertResponse(await POST(request('/api/business-cash/reconcile', {
      currentBalance: 95_000, expectedVersion: (await cash()).version, reason: 'Confirmed after pause', idempotencyKey: randomUUID(),
    })), 200);
    expect((await summary()).summary.reservedAmount).toBe(0);
    expect(await cash()).toMatchObject({ currentBalance: 95_000, anchorVersion: 2, needsReconciliation: false, featureEpoch: 'integration-reenabled' });
  });

  it('updates and deletes a recorded supplier payment through the existing transaction route', async () => {
    await open();
    const created = await bill();
    const payRoute = await import('@/app/api/supplier-payments/pay/route');
    const originalPaymentBody = await payBody(created.id, 20_000);
    const payment = (await assertResponse(await payRoute.POST(request('/api/supplier-payments/pay', originalPaymentBody)))).transaction;
    const { PUT, DELETE } = await import('@/app/api/transactions/[id]/route');
    await assertResponse(await PUT(request(`/api/transactions/${payment.id}`, {
      ...await payBody(created.id, 30_000), entityType: 'supplier', entityId: supplierId,
      type: 'debit', amount: 30_000, previousBalanceCashAmount: 0,
    }, 'PUT'), { params: Promise.resolve({ id: payment.id }) }), 200);
    expect((await cash()).currentBalance).toBe(70_000);
    expect((await db.collection('transactions').findOne({ _id: new ObjectId(created.id) }))!.pendingAmount).toBe(20_000);
    const retried = await assertResponse(await payRoute.POST(request('/api/supplier-payments/pay', {
      ...originalPaymentBody, expectedVersion: (await cash()).version,
    })));
    expect(retried.transaction).toMatchObject({ id: payment.id, cashPaidAmount: 30_000 });
    expect((await cash()).currentBalance).toBe(70_000);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(1);
    await assertResponse(await DELETE(request(`/api/transactions/${payment.id}`, undefined, 'DELETE'), { params: Promise.resolve({ id: payment.id }) }), 200);
    expect((await cash()).currentBalance).toBe(100_000);
    expect((await db.collection('transactions').findOne({ _id: new ObjectId(created.id) }))!.pendingAmount).toBe(50_000);
  });

  it('blocks deleting a paid bill and deleting the supplier containing it', async () => {
    await open();
    const created = await bill();
    const payRoute = await import('@/app/api/supplier-payments/pay/route');
    await assertResponse(await payRoute.POST(request('/api/supplier-payments/pay', await payBody(created.id, 20_000))));
    const transactionRoute = await import('@/app/api/transactions/[id]/route');
    await assertResponse(await transactionRoute.DELETE(request(`/api/transactions/${created.id}`, undefined, 'DELETE'), { params: Promise.resolve({ id: created.id }) }), 409);
    const supplierRoute = await import('@/app/api/suppliers/[id]/route');
    await assertResponse(await supplierRoute.DELETE(request(`/api/suppliers/${supplierId}`, undefined, 'DELETE'), { params: Promise.resolve({ id: supplierId }) }), 409);
    expect((await cash()).currentBalance).toBe(80_000);
    expect(await db.collection('transactions').countDocuments({ userId })).toBe(2);
  });

  it('records a single payment across two bills and Previous Balance without synthetic credits', async () => {
    await db.collection('suppliers').updateOne({ _id: new ObjectId(supplierId) }, { $set: { openingBalance: 10_000 } });
    await open();
    const a = await bill(30_000);
    const b = await bill(20_000);
    const { POST } = await import('@/app/api/supplier-payments/pay/route');
    await assertResponse(await POST(request('/api/supplier-payments/pay', {
      supplierId, paymentAllocations: [
        { billTransactionId: a.id, cashAmount: 15_000 },
        { billTransactionId: b.id, cashAmount: 5_000 },
      ], previousBalanceCashAmount: 4_000, date: today, requestId: randomUUID(), expectedVersion: (await cash()).version,
    })));
    expect((await cash()).currentBalance).toBe(76_000);
    expect((await summary()).suppliers[0]).toMatchObject({ totalDue: 36_000, previousBalance: 6_000 });
    expect(await db.collection('transactions').countDocuments({ userId, type: 'credit' })).toBe(2);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(1);
  });

  it('keeps an earlier confirmed cash anchor intact on historical entry edits and requires confirmation', async () => {
    await open();
    const added = await assertResponse(await daily(1_000, 'in'));
    const entryId = added.record.entries[0].id;
    const reconcile = await import('@/app/api/business-cash/reconcile/route');
    await assertResponse(await reconcile.POST(request('/api/business-cash/reconcile', {
      currentBalance: 90_000, expectedVersion: (await cash()).version, reason: 'Counted all business funds', idempotencyKey: randomUUID(),
    })), 200);
    const { PUT } = await import('@/app/api/daily-cash-records/[id]/route');
    await assertResponse(await PUT(request(`/api/daily-cash-records/${entryId}`, {
      amount: 1_500, type: 'in', date: today, description: 'Historical receipt correction',
    }, 'PUT'), { params: Promise.resolve({ id: entryId }) }), 200);
    expect(await cash()).toMatchObject({ currentBalance: 90_000, needsReconciliation: true, anchorVersion: 2 });
  });

  it('serializes simultaneous actual cash entries on the same day without losing entries or totals', async () => {
    await open();
    const responses = await Promise.all([daily(100, 'in'), daily(200, 'in'), daily(50, 'out')]);
    for (const response of responses) await assertResponse(response);
    expect((await cash()).currentBalance).toBe(100_250);
    expect(await db.collection('dailyCashRecords').countDocuments({ userId })).toBe(1);
    const record = await db.collection('dailyCashRecords').findOne({ userId });
    expect(record).toMatchObject({ totalIn: 300, totalOut: 50, totalLeft: 250 });
    expect(record!.entries).toHaveLength(3);
  });

  it('uses the invoice receipt helper once and reverses it when edited or deleted', async () => {
    await open();
    const { addInvoicePaymentCashEntry, replaceInvoicePaymentCashEntry, removeInvoicePaymentCashEntry } = await import('@/lib/invoice-payments');
    const input = { entryId: new ObjectId().toHexString(), paymentId: randomUUID(), invoiceId: new ObjectId().toHexString(), invoiceNumber: 'SALES-1', amount: 1_000, date: new Date(today), customerName: 'Local customer' };
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await addInvoicePaymentCashEntry(db, userId, input, session);
        await addInvoicePaymentCashEntry(db, userId, input, session);
      });
      expect((await cash()).currentBalance).toBe(101_000);
      await session.withTransaction(async () => { await replaceInvoicePaymentCashEntry(db, userId, { ...input, amount: 1_500 }, session); });
      expect((await cash()).currentBalance).toBe(101_500);
      await session.withTransaction(async () => { await removeInvoicePaymentCashEntry(db, userId, input.paymentId, session); });
      expect((await cash()).currentBalance).toBe(100_000);
      expect(await db.collection('dailyCashRecords').countDocuments({ userId })).toBe(0);
    } finally { await session.endSession(); }
  });

  it('repairs multiple legacy rollback payments incrementally before confirming cash', async () => {
    await open();
    const created = await bill();
    process.env.SUPPLIER_PAYMENTS_ENABLED = 'false';
    const transactionRoute = await import('@/app/api/transactions/route');
    const oldPayments: Json[] = [];
    for (const amount of [10_000, 5_000]) {
      oldPayments.push((await assertResponse(await transactionRoute.POST(request('/api/transactions', {
        entityType: 'supplier', entityId: supplierId, type: 'debit', amount, date: today,
      })))).transaction);
    }
    process.env.SUPPLIER_PAYMENTS_ENABLED = 'true';
    process.env.SUPPLIER_PAYMENTS_EPOCH = 'integration-after-legacy-payments';
    expect((await summary()).issues.length).toBeGreaterThan(0);
    const reconcile = await import('@/app/api/business-cash/reconcile/route');
    await assertResponse(await reconcile.POST(request('/api/business-cash/reconcile', {
      currentBalance: 85_000, expectedVersion: (await cash()).version, reason: 'Actual funds', idempotencyKey: randomUUID(),
    })), 409);
    const { PUT } = await import('@/app/api/transactions/[id]/route');
    for (const payment of oldPayments) {
      await assertResponse(await PUT(request(`/api/transactions/${payment.id}`, {
        entityType: 'supplier', entityId: supplierId, type: 'debit', amount: payment.amount,
        ...await payBody(created.id, payment.amount), previousBalanceCashAmount: 0,
      }, 'PUT'), { params: Promise.resolve({ id: payment.id }) }), 200);
    }
    expect((await cash()).currentBalance).toBe(100_000);
    expect((await summary()).issues).toEqual([]);
    await assertResponse(await reconcile.POST(request('/api/business-cash/reconcile', {
      currentBalance: 85_000, expectedVersion: (await cash()).version, reason: 'Confirmed after allocating old payments', idempotencyKey: randomUUID(),
    })), 200);
    expect(await cash()).toMatchObject({ currentBalance: 85_000, needsReconciliation: false });
    expect((await summary()).suppliers[0].bills[0].pendingAmount).toBe(35_000);
    expect(await db.collection('transactions').countDocuments({ userId, type: 'debit' })).toBe(2);
  });

  it('prevents a generic customer edit from becoming an untracked supplier cash payment', async () => {
    await open();
    const transactionId = new ObjectId();
    const customerId = new ObjectId().toHexString();
    await db.collection('transactions').insertOne({ _id: transactionId, userId, entityType: 'customer', entityId: customerId, type: 'debit', amount: 500, date: new Date(today) });
    const { PUT } = await import('@/app/api/transactions/[id]/route');
    await assertResponse(await PUT(request(`/api/transactions/${transactionId}`, {
      entityType: 'supplier', entityId: supplierId, type: 'debit', amount: 500, date: today,
    }, 'PUT'), { params: Promise.resolve({ id: transactionId.toHexString() }) }), 400);
    expect(await db.collection('transactions').findOne({ _id: transactionId })).toMatchObject({ entityType: 'customer', entityId: customerId, amount: 500 });
    expect((await cash()).currentBalance).toBe(100_000);
  });

  it('serializes supplier deletion against concurrent bill creation without orphaning a bill', async () => {
    await open();
    const supplierRoute = await import('@/app/api/suppliers/[id]/route');
    const transactionRoute = await import('@/app/api/transactions/route');
    const [deletion, creation] = await Promise.all([
      supplierRoute.DELETE(request(`/api/suppliers/${supplierId}`, undefined, 'DELETE'), { params: Promise.resolve({ id: supplierId }) }),
      transactionRoute.POST(request('/api/transactions', {
        entityType: 'supplier', entityId: supplierId, type: 'credit', amount: 500,
        invoiceNumber: randomUUID(), invoiceDate: today, dueDate: today, date: today, requestId: randomUUID(),
      })),
    ]);
    const storedSupplier = await db.collection('suppliers').findOne({ _id: new ObjectId(supplierId) });
    const billCount = await db.collection('transactions').countDocuments({ userId, entityId: supplierId, type: 'credit' });
    if (storedSupplier) {
      expect(deletion.status).toBe(409);
      expect(creation.status).toBe(201);
      expect(billCount).toBe(1);
    } else {
      expect(deletion.status).toBe(200);
      expect(creation.status).toBe(404);
      expect(billCount).toBe(0);
    }
    expect((await cash()).currentBalance).toBe(100_000);
  });
});
