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

function invoiceFindChain(items: unknown[] = []) {
  const toArray = vi.fn().mockResolvedValue(items);
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  const find = vi.fn(() => ({ sort }));
  return { find, sort, limit, toArray };
}

function dbWithCollections(collections: Record<string, unknown>) {
  return {
    collection: vi.fn((name: string) => collections[name]),
  };
}

function storedInventory(quantity = 8) {
  return {
    _id: objectIdLike(ids.inventory),
    itemNumber: 'BP-104',
    itemName: 'BRAKE PAD',
    quantity,
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
    mocks.session.withTransaction.mockReset();
    mocks.session.endSession.mockReset();
    mocks.client.startSession.mockReset();

    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.deleteByPattern.mockResolvedValue(0);
    mocks.redisDel.mockResolvedValue(1);
    mocks.invalidateInventoryCache.mockResolvedValue(undefined);
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
          {
            inventoryItemId: ids.inventory,
            itemNumber: 'BP-104',
            itemName: 'BRAKE PAD',
            quantity: 2,
            amount: 900,
          },
        ],
        totalAmount: 900,
      }),
      { session: mocks.session }
    );
    expect(mocks.invalidateInventoryCache).toHaveBeenCalledWith(ids.user, ids.inventory);
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
          {
            itemNumber: undefined,
            itemName: 'LABOUR',
            quantity: 1,
            amount: 250,
          },
        ],
      }),
      { session: mocks.session }
    );
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
