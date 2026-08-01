import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
  deleteByPattern: vi.fn(),
  redisDel: vi.fn(),
  invalidateInventoryCache: vi.fn(),
  uploadInvoicePdf: vi.fn(),
  deleteAsset: vi.fn(),
  refreshUserReadModels: vi.fn(),
  bumpCacheVersions: vi.fn(),
  session: {
    withTransaction: vi.fn(),
    endSession: vi.fn(),
  },
  client: {
    startSession: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
  default: Promise.resolve(mocks.client),
}));

vi.mock('@/lib/redis', () => ({
  default: {
    get: mocks.redisGet,
    setex: mocks.redisSetex,
    del: mocks.redisDel,
  },
  deleteByPattern: mocks.deleteByPattern,
}));

vi.mock('@/lib/cache', () => ({
  invalidateInventoryCache: mocks.invalidateInventoryCache,
}));

vi.mock('@/lib/read-models', () => ({
  refreshUserReadModels: mocks.refreshUserReadModels,
}));

vi.mock('@/lib/cache-version', () => ({
  bumpCacheVersions: mocks.bumpCacheVersions,
  getCachedJson: vi.fn().mockResolvedValue(null),
  requestCacheKey: vi.fn().mockResolvedValue('invoice-test-cache-key'),
  setCachedJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/invoice-pdf', () => ({
  isSellerSnapshotComplete: vi.fn(() => true),
  sellerSnapshotFromUser: vi.fn(() => ({
    firmTitle: 'Test Firm',
    gstNumber: 'GST123',
    firmPhone: '9999999999',
    firmEmail: 'firm@example.com',
    firmAddress: 'Test Address',
  })),
  uploadInvoicePdf: mocks.uploadInvoicePdf,
}));

vi.mock('@/lib/cloudinary', () => ({
  deleteAsset: mocks.deleteAsset,
}));

function invoiceFindChain(items: unknown[] = []) {
  const toArray = vi.fn().mockResolvedValue(items);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  const find = vi.fn(() => ({ sort }));
  return { find, sort, limit, toArray };
}

function dbWithCollections(collections: Record<string, unknown>) {
  return {
    collection: vi.fn((name: string) => {
      if (collections[name]) return collections[name];
      if (name === 'users') return { findOne: vi.fn().mockResolvedValue({ _id: objectIdLike(ids.user) }) };
      if (name === 'dailyCashRecords') return {
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      };
      return {};
    }),
  };
}

function storedInventory(quantity = 8) {
  return {
    _id: objectIdLike(ids.inventory),
    itemNumber: 'BP-104',
    itemName: 'BRAKE PAD',
    quantity,
    buyingPrice: 450,
  };
}

function inventoryFindChain(items: unknown[] = []) {
  const toArray = vi.fn().mockResolvedValue(items);
  const find = vi.fn(() => ({ toArray }));
  return { find, toArray };
}

function linkedItem(quantity = 2, amount = 900) {
  return {
    inventoryItemId: ids.inventory,
    itemNumber: 'BP-104',
    itemName: 'typed name',
    quantity,
    amount,
  };
}

function manualItem(amount = 250) {
  return {
    itemName: 'LABOUR',
    quantity: 1,
    amount,
    unitCost: 0,
  };
}

function createBody(items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'Raj Traders',
    items,
    paidAmount: 0,
    status: 'unpaid',
    addToLedger: false,
    createCustomerIfNew: false,
    ...overrides,
  };
}

describe('/api/invoices stock sync', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSetex.mockReset();
    mocks.deleteByPattern.mockReset();
    mocks.redisDel.mockReset();
    mocks.invalidateInventoryCache.mockReset();
    mocks.uploadInvoicePdf.mockReset();
    mocks.deleteAsset.mockReset();
    mocks.refreshUserReadModels.mockReset();
    mocks.bumpCacheVersions.mockReset();
    mocks.session.withTransaction.mockReset();
    mocks.session.endSession.mockReset();
    mocks.client.startSession.mockReset();

    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.deleteByPattern.mockResolvedValue(0);
    mocks.redisDel.mockResolvedValue(1);
    mocks.invalidateInventoryCache.mockResolvedValue(undefined);
    mocks.uploadInvoicePdf.mockResolvedValue({ url: 'https://example.com/invoice.pdf', publicId: 'invoice.pdf' });
    mocks.deleteAsset.mockResolvedValue(undefined);
    mocks.refreshUserReadModels.mockResolvedValue(undefined);
    mocks.bumpCacheVersions.mockResolvedValue(undefined);
    mocks.client.startSession.mockReturnValue(mocks.session);
    mocks.session.withTransaction.mockImplementation(async (callback: () => Promise<void>) => {
      await callback();
    });
    mocks.session.endSession.mockResolvedValue(undefined);
  });

  it('deducts linked inventory when creating an invoice', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn().mockResolvedValue({ insertedId: objectIdLike('507f1f77bcf86cd799439099') });
    const inventoryLookup = inventoryFindChain([storedInventory(8)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue(storedInventory(6)),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest('http://localhost/api/invoices', createBody([linkedItem()])));

    expect(response.status).toBe(201);
    expect(mocks.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user, quantity: { $gte: 2 } },
      {
        $inc: { quantity: -2 },
        $set: {
          lastQuantityUpdatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      },
      { returnDocument: 'after', session: mocks.session }
    );
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            inventoryItemId: ids.inventory,
            itemNumber: 'BP-104',
            itemName: 'typed name',
            quantity: 2,
            amount: 900,
            unitPrice: 450,
            unitCost: 450,
            cogs: 900,
          }),
        ],
        totalAmount: 900,
      }),
      { session: mocks.session }
    );
    expect(mocks.invalidateInventoryCache).toHaveBeenCalledWith(ids.user, ids.inventory);
  });

  it('links stock by inventory ID when the item has no part number and preserves the invoice description', async () => {
    const inventoryItemWithoutNumber = {
      _id: objectIdLike(ids.inventory),
      itemNumber: '',
      itemName: 'BRAKE SHOE',
      quantity: 8,
      buyingPrice: 300,
    };
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn().mockResolvedValue({
      insertedId: objectIdLike('507f1f77bcf86cd799439099'),
    });
    const inventoryLookup = inventoryFindChain([inventoryItemWithoutNumber]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        ...inventoryItemWithoutNumber,
        quantity: 6,
      }),
    };
    mocks.getDb.mockResolvedValue(dbWithCollections({
      invoices: { find: invoiceFind.find, insertOne },
      customers: {},
      transactions: {},
      inventory,
    }));

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest(
      'http://localhost/api/invoices',
      createBody([{
        inventoryItemId: ids.inventory,
        itemNumber: '',
        itemName: 'FRONT BRAKE SHOE',
        quantity: 2,
        unitPrice: 500,
      }])
    ));

    expect(response.status).toBe(201);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user, quantity: { $gte: 2 } },
      expect.objectContaining({ $inc: { quantity: -2 } }),
      { returnDocument: 'after', session: mocks.session }
    );
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({
          inventoryItemId: ids.inventory,
          itemNumber: '',
          itemName: 'FRONT BRAKE SHOE',
          quantity: 2,
          unitPrice: 500,
          unitCost: 300,
          amount: 1000,
          cogs: 600,
          grossProfit: 400,
        })],
        totalAmount: 1000,
        totalCogs: 600,
        grossProfit: 400,
      }),
      { session: mocks.session }
    );
  });

  it('creates manual invoice rows without touching inventory quantity', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn().mockResolvedValue({ insertedId: objectIdLike('507f1f77bcf86cd799439099') });
    const inventoryLookup = inventoryFindChain();
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest('http://localhost/api/invoices', createBody([manualItem()])));

    expect(response.status).toBe(201);
    expect(inventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            itemNumber: undefined,
            itemName: 'LABOUR',
            quantity: 1,
            amount: 250,
            unitPrice: 250,
            unitCost: 0,
          }),
        ],
      }),
      { session: mocks.session }
    );
  });

  it('stores a backdated invoice date and uses its month for the invoice number', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn().mockResolvedValue({
      insertedId: objectIdLike('507f1f77bcf86cd799439099'),
    });
    const inventoryLookup = inventoryFindChain();
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory: {
          find: inventoryLookup.find,
          findOne: vi.fn(),
          findOneAndUpdate: vi.fn(),
        },
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest(
      'http://localhost/api/invoices',
      createBody([manualItem()], { invoiceDate: '2026-06-15' })
    ));

    expect(response.status).toBe(201);
    expect(invoiceFind.find).toHaveBeenCalledWith(
      {
        userId: ids.user,
        invoiceNumber: { $regex: '^INV-2026-06-' },
      },
      { session: mocks.session }
    );
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'INV-2026-06-0001',
        invoiceDate: new Date('2026-06-15T00:00:00.000Z'),
        createdAt: expect.any(Date),
      }),
      { session: mocks.session }
    );
    expect(mocks.uploadInvoicePdf).toHaveBeenCalledWith(
      ids.user,
      expect.objectContaining({
        invoiceDate: new Date('2026-06-15T00:00:00.000Z'),
      })
    );
  });

  it('creates an invoice with linked stock and a manual item that has a part number', async () => {
    const linkedInventoryItem = {
      _id: objectIdLike(ids.inventory),
      itemNumber: 'F 002 H27 738-4AR',
      itemName: 'DIESEL FILTER SET OF 2 1/2 LITRE',
      quantity: 61,
      buyingPrice: 130,
    };
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn().mockResolvedValue({
      insertedId: objectIdLike('507f1f77bcf86cd799439099'),
    });
    const inventoryLookup = inventoryFindChain([linkedInventoryItem]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        ...linkedInventoryItem,
        quantity: 60,
      }),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest(
      'http://localhost/api/invoices',
      createBody([
        {
          inventoryItemId: ids.inventory,
          itemNumber: 'F 002 H27 738-4AR',
          itemName: 'DIESEL FILTER SET OF 2 1/2 LITRE',
          quantity: 1,
          unitPrice: 170,
          unitCost: 130,
        },
        {
          itemNumber: 'tmacvfs001',
          itemName: 'gilasi',
          quantity: 1,
          unitPrice: 150,
          unitCost: 105,
        },
      ])
    ));

    expect(response.status).toBe(201);
    expect(inventoryLookup.find).toHaveBeenCalledTimes(1);
    expect(inventoryLookup.find).toHaveBeenCalledWith(
      {
        userId: ids.user,
        $or: [
          { _id: { $in: [expect.any(Object)] } },
          { itemNumberKey: { $in: ['TMACVFS001'] } },
        ],
      },
      expect.objectContaining({ session: mocks.session })
    );
    expect(inventory.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            inventoryItemId: ids.inventory,
            itemNumber: 'F 002 H27 738-4AR',
            unitPrice: 170,
            unitCost: 130,
          }),
          expect.objectContaining({
            itemNumber: 'tmacvfs001',
            itemName: 'gilasi',
            unitPrice: 150,
            unitCost: 105,
          }),
        ],
        totalAmount: 320,
        totalCogs: 235,
        grossProfit: 85,
      }),
      { session: mocks.session }
    );
    expect(insertOne.mock.calls[0][0].items[1]).not.toHaveProperty('inventoryItemId');
  });

  it('returns an already-created invoice for a repeated client request id', async () => {
    const existingInvoice = {
      _id: objectIdLike(ids.transaction),
      invoiceNumber: 'INV-2026-07-0001',
      clientRequestId: 'invoice-request-123',
      totalAmount: 900,
    };
    const invoices = {
      findOne: vi.fn().mockResolvedValue(existingInvoice),
      insertOne: vi.fn(),
    };
    mocks.getDb.mockResolvedValue(dbWithCollections({ invoices }));

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest(
      'http://localhost/api/invoices',
      createBody([manualItem()], { clientRequestId: 'invoice-request-123' })
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invoice already created',
      invoice: { id: ids.transaction, invoiceNumber: 'INV-2026-07-0001' },
    });
    expect(invoices.insertOne).not.toHaveBeenCalled();
    expect(mocks.uploadInvoicePdf).not.toHaveBeenCalled();
    expect(mocks.client.startSession).not.toHaveBeenCalled();
  });

  it('adds an initial partial payment to Daily Cash with the stored invoice PDF', async () => {
    const invoiceFind = invoiceFindChain();
    const invoiceInsert = vi.fn().mockResolvedValue({ insertedId: objectIdLike('507f1f77bcf86cd799439099') });
    const inventoryLookup = inventoryFindChain([storedInventory(8)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue(storedInventory(6)),
    };
    const dailyCashInsert = vi.fn().mockResolvedValue({ insertedId: objectIdLike('507f1f77bcf86cd799439098') });
    const dailyCash = {
      findOne: vi.fn().mockResolvedValue(null),
      insertOne: dailyCashInsert,
    };
    mocks.getDb.mockResolvedValue(dbWithCollections({
      invoices: { find: invoiceFind.find, insertOne: invoiceInsert },
      customers: {},
      transactions: {},
      inventory,
      dailyCashRecords: dailyCash,
    }));

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest(
      'http://localhost/api/invoices',
      createBody([{
        inventoryItemId: ids.inventory,
        itemNumber: 'BP-104',
        itemName: 'Brake Pad',
        quantity: 2,
        unitPrice: 500,
        unitCost: 450,
      }], { paidAmount: 400, paymentDate: '2026-07-22', status: 'partial' })
    ));

    expect(response.status).toBe(201);
    expect(dailyCashInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        totalIn: 400,
        totalOut: 0,
        totalLeft: 400,
        entries: [expect.objectContaining({
          amount: 400,
          source: 'invoice_payment',
          billUrl: 'https://example.com/invoice.pdf',
        })],
      }),
      { session: mocks.session }
    );
    expect(invoiceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 1000,
        paidAmount: 400,
        status: 'partial',
        payments: [expect.objectContaining({ amount: 400, source: 'initial' })],
      }),
      { session: mocks.session }
    );
  });

  it('adds a later partial payment to Daily Cash and the invoice payment history', async () => {
    const invoice = {
      _id: objectIdLike(ids.transaction),
      invoiceNumber: 'INV-2026-07-0001',
      customerName: 'Raj Traders',
      items: [linkedItem(2, 1000)],
      totalAmount: 1000,
      paidAmount: 400,
      payments: [],
      status: 'partial',
      addedToLedger: false,
      sellerSnapshot: { firmTitle: 'Test Firm' },
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
    };
    const invoiceUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const dailyCashInsert = vi.fn().mockResolvedValue({ insertedId: objectIdLike(ids.customEntity) });
    const db = dbWithCollections({
      invoices: { findOne: vi.fn().mockResolvedValue(invoice), updateOne: invoiceUpdate },
      dailyCashRecords: {
        findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        insertOne: dailyCashInsert,
        updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
    });
    mocks.getDb.mockResolvedValue(db);

    const { POST } = await import('@/app/api/invoices/[id]/payments/route');
    const response = await POST(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}/payments`,
        { amount: 200, date: '2026-07-23', idempotencyKey: 'payment-request-123' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(201);
    expect(dailyCashInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        date: new Date('2026-07-23T00:00:00.000Z'),
        totalIn: 200,
        entries: [expect.objectContaining({
          amount: 200,
          source: 'invoice_payment',
          invoiceId: ids.transaction,
          billUrl: 'https://example.com/invoice.pdf',
        })],
      }),
      { session: mocks.session }
    );
    expect(invoiceUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      expect.objectContaining({
        $set: expect.objectContaining({
          paidAmount: 600,
          status: 'partial',
          payments: [
            expect.objectContaining({ amount: 400, source: 'legacy' }),
            expect.objectContaining({ amount: 200, source: 'added' }),
          ],
        }),
      }),
      { session: mocks.session }
    );
  });

  it('returns the existing payment when the same payment request is retried', async () => {
    const existingPayment = {
      id: ids.supplier,
      idempotencyKey: 'payment-request-123',
      amount: 200,
      source: 'added',
    };
    const invoiceUpdate = vi.fn();
    mocks.getDb.mockResolvedValue(dbWithCollections({
      invoices: {
        findOne: vi.fn().mockResolvedValue({
          _id: objectIdLike(ids.transaction),
          customerId: ids.customer,
          totalAmount: 1000,
          paidAmount: 600,
          payments: [existingPayment],
        }),
        updateOne: invoiceUpdate,
      },
    }));

    const { POST } = await import('@/app/api/invoices/[id]/payments/route');
    const response = await POST(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}/payments`,
        { amount: 200, date: '2026-07-23', idempotencyKey: 'payment-request-123' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Payment already recorded',
      payment: existingPayment,
    });
    expect(invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.uploadInvoicePdf).not.toHaveBeenCalled();
  });

  it('rejects a later payment that exceeds the remaining invoice balance', async () => {
    const invoiceUpdate = vi.fn();
    const dailyCashInsert = vi.fn();
    mocks.getDb.mockResolvedValue(dbWithCollections({
      invoices: {
        findOne: vi.fn().mockResolvedValue({
          _id: objectIdLike(ids.transaction),
          invoiceNumber: 'INV-2026-07-0001',
          customerName: 'Raj Traders',
          items: [],
          totalAmount: 1000,
          paidAmount: 900,
          payments: [],
          addedToLedger: false,
        }),
        updateOne: invoiceUpdate,
      },
      dailyCashRecords: { insertOne: dailyCashInsert },
    }));

    const { POST } = await import('@/app/api/invoices/[id]/payments/route');
    const response = await POST(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}/payments`,
        { amount: 101, date: '2026-07-23' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'OVERPAYMENT' });
    expect(mocks.uploadInvoicePdf).not.toHaveBeenCalled();
    expect(dailyCashInsert).not.toHaveBeenCalled();
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it('requires an explicit cost price for manual items', async () => {
    const invoiceFind = invoiceFindChain();
    const invoiceInsert = vi.fn();
    const inventoryLookup = inventoryFindChain();
    mocks.getDb.mockResolvedValue(dbWithCollections({
      invoices: { find: invoiceFind.find, insertOne: invoiceInsert },
      customers: {},
      transactions: {},
      inventory: { find: inventoryLookup.find, findOneAndUpdate: vi.fn() },
    }));

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest(
      'http://localhost/api/invoices',
      createBody([{ itemName: 'Manual service', quantity: 1, unitPrice: 500 }])
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'MISSING_COST_PRICE' });
    expect(invoiceInsert).not.toHaveBeenCalled();
  });

  it('aggregates duplicate inventory rows before deducting stock', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn().mockResolvedValue({ insertedId: objectIdLike('507f1f77bcf86cd799439099') });
    const inventoryLookup = inventoryFindChain([storedInventory(10)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue(storedInventory(5)),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(
      jsonRequest('http://localhost/api/invoices', createBody([linkedItem(2, 900), linkedItem(3, 1200)]))
    );

    expect(response.status).toBe(201);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user, quantity: { $gte: 5 } },
      expect.objectContaining({ $inc: { quantity: -5 } }),
      { returnDocument: 'after', session: mocks.session }
    );
  });

  it('retries invoice creation when a concurrent invoice number wins the unique index', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi
      .fn()
      .mockRejectedValueOnce({ code: 11000 })
      .mockResolvedValueOnce({ insertedId: objectIdLike('507f1f77bcf86cd799439099') });
    const inventoryLookup = inventoryFindChain([storedInventory(10)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue(storedInventory(8)),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest('http://localhost/api/invoices', createBody([linkedItem()])));

    expect(response.status).toBe(201);
    expect(mocks.client.startSession).toHaveBeenCalledTimes(2);
    expect(mocks.session.withTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.session.endSession).toHaveBeenCalledTimes(2);
    expect(insertOne).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateInventoryCache).toHaveBeenCalledTimes(1);
  });

  it('blocks invoice creation and skips invoice insert when stock is insufficient', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn();
    const inventoryLookup = inventoryFindChain([storedInventory(1)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn().mockResolvedValue(storedInventory(1)),
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest('http://localhost/api/invoices', createBody([linkedItem(2)])));

    expect(response.status).toBe(409);
    expect(insertOne).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: {
        itemName: 'BRAKE PAD',
        availableQuantity: 1,
        requestedQuantity: 2,
      },
    });
  });

  it('rejects missing linked inventory before inserting an invoice', async () => {
    const invoiceFind = invoiceFindChain();
    const insertOne = vi.fn();
    const inventoryLookup = inventoryFindChain();
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne },
        customers: {},
        transactions: {},
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(jsonRequest('http://localhost/api/invoices', createBody([linkedItem()])));

    expect(response.status).toBe(404);
    expect(insertOne).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVENTORY_ITEM_NOT_FOUND',
    });
  });

  it('keeps customer creation inside the transaction when stock deduction fails', async () => {
    const invoiceFind = invoiceFindChain();
    const invoiceInsert = vi.fn();
    const customerInsert = vi.fn().mockResolvedValue({ insertedId: objectIdLike(ids.customer) });
    const inventoryLookup = inventoryFindChain([storedInventory(1)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn().mockResolvedValue(storedInventory(1)),
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices: { find: invoiceFind.find, insertOne: invoiceInsert },
        customers: { insertOne: customerInsert },
        transactions: { insertOne: vi.fn() },
        inventory,
      })
    );

    const { POST } = await import('@/app/api/invoices/route');
    const response = await POST(
      jsonRequest(
        'http://localhost/api/invoices',
        createBody([linkedItem(2)], {
          addToLedger: true,
          createCustomerIfNew: true,
        })
      )
    );

    expect(response.status).toBe(409);
    expect(customerInsert).toHaveBeenCalledWith(expect.any(Object), { session: mocks.session });
    expect(invoiceInsert).not.toHaveBeenCalled();
  });

  it('deducts only the quantity increase when editing an invoice', async () => {
    const previousInvoice = {
      _id: objectIdLike('507f1f77bcf86cd799439099'),
      invoiceNumber: 'INV-2026-06-0001',
      customerName: 'Raj Traders',
      items: [{ ...linkedItem(1, 450), itemName: 'BRAKE PAD' }],
      totalAmount: 450,
      paidAmount: 0,
      status: 'unpaid',
      addedToLedger: false,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    };
    const updatedInvoice = {
      ...previousInvoice,
      items: [{ ...linkedItem(3, 1350), itemName: 'BRAKE PAD' }],
      totalAmount: 1350,
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    };
    const invoices = {
      findOne: vi.fn().mockResolvedValueOnce(previousInvoice).mockResolvedValueOnce(updatedInvoice),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const inventoryLookup = inventoryFindChain([storedInventory(8)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue(storedInventory(6)),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices,
        transactions: {},
        inventory,
      })
    );

    const { PUT } = await import('@/app/api/invoices/[id]/route');
    const response = await PUT(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}`,
        { items: [linkedItem(3, 1350)], paidAmount: 0, status: 'unpaid' },
        { method: 'PUT' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user, quantity: { $gte: 2 } },
      expect.objectContaining({ $inc: { quantity: -2 } }),
      { returnDocument: 'after', session: mocks.session }
    );
    expect(invoices.updateOne).toHaveBeenCalled();
  });

  it('updates the invoice date, PDF, and linked ledger debit together', async () => {
    const previousInvoice = {
      _id: objectIdLike(ids.transaction),
      invoiceNumber: 'INV-2026-06-0001',
      customerId: ids.customer,
      customerName: 'Raj Traders',
      items: [manualItem()],
      totalAmount: 250,
      paidAmount: 0,
      status: 'unpaid',
      addedToLedger: true,
      transactionId: ids.inventory,
      invoiceDate: new Date('2026-06-01T00:00:00.000Z'),
      createdAt: new Date('2026-06-10T08:30:00.000Z'),
      updatedAt: new Date('2026-06-10T08:30:00.000Z'),
    };
    const updatedInvoice = {
      ...previousInvoice,
      invoiceDate: new Date('2026-05-15T00:00:00.000Z'),
    };
    const invoices = {
      findOne: vi.fn().mockResolvedValueOnce(previousInvoice).mockResolvedValueOnce(updatedInvoice),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const ledgerUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices,
        transactions: { updateOne: ledgerUpdate },
        inventory: {},
      })
    );

    const { PUT } = await import('@/app/api/invoices/[id]/route');
    const response = await PUT(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}`,
        { invoiceDate: '2026-05-15' },
        { method: 'PUT' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(ledgerUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      {
        $set: {
          amount: 250,
          date: new Date('2026-05-15T00:00:00.000Z'),
        },
      },
      { session: mocks.session }
    );
    expect(invoices.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      {
        $set: expect.objectContaining({
          invoiceDate: new Date('2026-05-15T00:00:00.000Z'),
        }),
      },
      { session: mocks.session }
    );
    expect(mocks.uploadInvoicePdf).toHaveBeenCalledWith(
      ids.user,
      expect.objectContaining({
        invoiceDate: new Date('2026-05-15T00:00:00.000Z'),
      })
    );
  });

  it('rejects direct paid-amount edits and keeps historical inventory untouched', async () => {
    const historicalItem = {
      ...linkedItem(1, 450),
      itemNumber: 'OLD-BP-104',
      itemName: 'OLD BRAKE PAD',
    };
    const previousInvoice = {
      _id: objectIdLike(ids.transaction),
      invoiceNumber: 'INV-2026-06-0001',
      customerName: 'Raj Traders',
      items: [historicalItem],
      totalAmount: 450,
      paidAmount: 100,
      status: 'partial',
      addedToLedger: false,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    };
    const invoices = {
      findOne: vi.fn().mockResolvedValueOnce(previousInvoice),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const inventory = {
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices,
        transactions: {},
        inventory,
      })
    );

    const { PUT } = await import('@/app/api/invoices/[id]/route');
    const response = await PUT(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}`,
        {
          items: [historicalItem],
          paidAmount: 250,
          status: 'partial',
        },
        { method: 'PUT' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(400);
    expect(inventory.find).not.toHaveBeenCalled();
    expect(inventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(invoices.updateOne).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: 'USE_PAYMENT_HISTORY' });
  });

  it('blocks an edit that increases quantity beyond available stock', async () => {
    const previousInvoice = {
      _id: objectIdLike('507f1f77bcf86cd799439099'),
      invoiceNumber: 'INV-2026-06-0001',
      customerName: 'Raj Traders',
      items: [{ ...linkedItem(1, 450), itemName: 'BRAKE PAD' }],
      totalAmount: 450,
      paidAmount: 0,
      status: 'unpaid',
      addedToLedger: false,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    };
    const invoices = {
      findOne: vi.fn().mockResolvedValue(previousInvoice),
      updateOne: vi.fn(),
    };
    const inventoryLookup = inventoryFindChain([storedInventory(2)]);
    const inventory = {
      find: inventoryLookup.find,
      findOne: vi.fn().mockResolvedValue(storedInventory(2)),
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices,
        transactions: {},
        inventory,
      })
    );

    const { PUT } = await import('@/app/api/invoices/[id]/route');
    const response = await PUT(
      jsonRequest(
        `http://localhost/api/invoices/${ids.transaction}`,
        { items: [linkedItem(5, 2250)] },
        { method: 'PUT' }
      ),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(409);
    expect(invoices.updateOne).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
  });

  it('restores linked stock and ignores manual rows when deleting an invoice', async () => {
    const invoice = {
      _id: objectIdLike(ids.transaction),
      invoiceNumber: 'INV-2026-06-0001',
      customerId: ids.customer,
      items: [{ ...linkedItem(2, 900), itemName: 'BRAKE PAD' }, manualItem()],
      addedToLedger: true,
    };
    const invoices = {
      findOne: vi.fn().mockResolvedValue(invoice),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const transactions = {
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
    };
    const inventory = {
      find: inventoryFindChain().find,
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue(storedInventory(10)),
    };
    mocks.getDb.mockResolvedValue(
      dbWithCollections({
        invoices,
        transactions,
        inventory,
      })
    );

    const { DELETE } = await import('@/app/api/invoices/[id]/route');
    const response = await DELETE(
      jsonRequest(`http://localhost/api/invoices/${ids.transaction}?deleteTransactions=true`, undefined, {
        method: 'DELETE',
      }),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(inventory.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      expect.objectContaining({ $inc: { quantity: 2 } }),
      { returnDocument: 'after', session: mocks.session }
    );
    expect(transactions.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ids.user,
        entityId: ids.customer,
      }),
      { session: mocks.session }
    );
    expect(invoices.deleteOne).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      { session: mocks.session }
    );
  });
});
