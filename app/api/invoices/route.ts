import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ClientSession, Db, MongoServerError, ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { invalidateInventoryCache } from '@/lib/cache';
import { bumpCacheVersions, getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';
import { entitySearchTokens, invoiceSearchTokens, queryTokens } from '@/lib/search-normalization';
import { refreshUserReadModels } from '@/lib/read-models';
import {
  applyInventoryAdjustments,
  getInventoryDiffAdjustments,
  InvoiceStockError,
  normalizeInvoiceItemsForSave,
} from '@/lib/invoice-stock';
import type { InvoiceItem } from '@/lib/types';

const invoiceItemSchema = z.object({
  inventoryItemId: z.string().trim().optional(),
  itemNumber: z.string().trim().optional(),
  itemName: z.string().trim().min(1, 'Item name is required'),
  quantity: z.number().finite().positive('Quantity must be greater than zero'),
  amount: z.number().finite().positive('Amount must be greater than zero'),
});

const createInvoiceSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(1, 'Customer name is required'),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  paidAmount: z.number().min(0).default(0),
  status: z.enum(['paid', 'unpaid', 'partial']),
  notes: z.string().optional(),
  addToLedger: z.boolean().default(false),
  createCustomerIfNew: z.boolean().default(false),
});

type CreatedInvoiceResponse = {
  id: string;
  userId: string;
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'unpaid' | 'partial';
  notes: string;
  addedToLedger: boolean;
  transactionId?: string;
  searchTokens?: string[];
  createdAt: Date;
  updatedAt: Date;
};

const INVOICE_NUMBER_RETRY_ATTEMPTS = 3;

function isDuplicateInvoiceNumberError(error: unknown) {
  if (error instanceof MongoServerError) {
    return error.code === 11000;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Generate next invoice number in format: INV-YYYY-MM-XXXX
 */
async function generateInvoiceNumber(
  db: Db,
  userId: string,
  session?: ClientSession
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INV-${year}-${month}-`;

  const invoicesCollection = db.collection('invoices');
  
  const latestInvoice = await invoicesCollection
    .find(
      {
        userId,
        invoiceNumber: { $regex: `^${prefix}` },
      },
      { session }
    )
    .sort({ invoiceNumber: -1 })
    .limit(1)
    .toArray();

  let nextNumber = 1;
  if (latestInvoice.length > 0) {
    const lastNumber = latestInvoice[0].invoiceNumber;
    const lastSeq = parseInt(lastNumber.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) {
      nextNumber = lastSeq + 1;
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

async function invalidateInvoiceCaches(
  db: Db,
  userId: string,
  customerId: string | undefined,
  changedInventoryIds: Set<string>
) {
  try {
    await refreshUserReadModels(db, userId);
    await bumpCacheVersions(userId, ['invoices', 'dashboard', 'customers', 'inventory', 'search', 'bootstrap']);
    if (customerId) {
      await redis.del(
        `ledger:customer:${customerId}:${userId}`
      );
    }
    if (changedInventoryIds.size > 0) {
      await Promise.all(
        Array.from(changedInventoryIds).map((itemId) =>
          invalidateInventoryCache(userId, itemId)
        )
      );
    }
  } catch (cacheError) {
    console.warn('Redis cache invalidation failed:', cacheError);
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const pageParam = Number(searchParams.get('page') || '1');
    const limitParam = Number(searchParams.get('limit') || '20');
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const limit = Number.isNaN(limitParam) || limitParam < 1 ? 20 : Math.min(limitParam, 100);
    const skip = (page - 1) * limit;

    const cacheKey = await requestCacheKey(
      request,
      'invoices',
      userId,
      `${customerId || ''}:${status || ''}:${search || ''}:${page}:${limit}`
    );
    const cachedData = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cachedData) {
      return NextResponse.json(cachedData, { status: 200 });
    }

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');

    type InvoiceQuery = {
      userId: string;
      customerId?: string;
      status?: string;
      searchTokens?: { $all: string[] };
    };

    const query: InvoiceQuery = { userId };
    
    if (customerId) {
      query.customerId = customerId;
    }
    if (status && ['paid', 'unpaid', 'partial'].includes(status)) {
      query.status = status;
    }
    if (search) {
      const tokens = queryTokens(search);
      if (tokens.length > 0) {
        query.searchTokens = { $all: tokens };
      }
    }

    const [total, invoices] = await Promise.all([
      invoicesCollection.countDocuments(query),
      invoicesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const responseData = {
      invoices: invoices.map((inv) => ({
        id: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        customerAddress: inv.customerAddress,
        items: inv.items,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        status: inv.status,
        notes: inv.notes,
        addedToLedger: inv.addedToLedger,
        transactionId: inv.transactionId,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      })),
      pagination: {
        total,
        page,
        pageSize: limit,
        totalPages,
      },
    };

    await setCachedJson(cacheKey, 300, responseData);

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error('Get invoices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createInvoiceSchema.parse(body);

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');
    const customersCollection = db.collection('customers');
    const transactionsCollection = db.collection('transactions');
    const client = await clientPromise;
    const changedInventoryIds = new Set<string>();
    let savedCustomerId: string | undefined;
    let createdInvoice: CreatedInvoiceResponse | undefined;

    for (let attempt = 1; attempt <= INVOICE_NUMBER_RETRY_ATTEMPTS; attempt += 1) {
      const session = client.startSession();
      changedInventoryIds.clear();
      savedCustomerId = undefined;
      createdInvoice = undefined;

      try {
        await session.withTransaction(async () => {
          const normalizedItems = await normalizeInvoiceItemsForSave(
            db,
            userId,
            validatedData.items,
            session
          );
          const totalAmount = normalizedItems.reduce((sum, item) => sum + item.amount, 0);

          let status = validatedData.status;
          if (validatedData.paidAmount >= totalAmount) {
            status = 'paid';
          } else if (validatedData.paidAmount > 0) {
            status = 'partial';
          } else {
            status = 'unpaid';
          }

          let customerId = validatedData.customerId;

          if (customerId) {
            if (!ObjectId.isValid(customerId)) {
              throw new InvoiceStockError('INVALID_CUSTOMER', 'Invalid customer id', 400);
            }

            const customer = await customersCollection.findOne(
              {
                _id: new ObjectId(customerId),
                userId,
              },
              { session }
            );
            if (!customer) {
              throw new InvoiceStockError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
            }
          } else if (validatedData.createCustomerIfNew) {
            const newCustomer = await customersCollection.insertOne(
              {
                userId,
                name: validatedData.customerName,
                phone: validatedData.customerPhone || '',
                email: '',
                address: validatedData.customerAddress || '',
                openingBalance: 0,
                balanceType: 'debit',
                searchTokens: entitySearchTokens({
                  name: validatedData.customerName,
                  phone: validatedData.customerPhone,
                  email: '',
                }),
                createdAt: new Date(),
              },
              { session }
            );
            customerId = newCustomer.insertedId.toString();
          }

          savedCustomerId = customerId;
          const invoiceNumber = await generateInvoiceNumber(db, userId, session);
          const now = new Date();
          const invoiceDoc = {
            userId,
            invoiceNumber,
            customerId: customerId || undefined,
            customerName: validatedData.customerName,
            customerPhone: validatedData.customerPhone || '',
            customerAddress: validatedData.customerAddress || '',
            items: normalizedItems,
            totalAmount,
            paidAmount: validatedData.paidAmount,
            status,
            notes: validatedData.notes || '',
            addedToLedger: false,
            transactionId: undefined as string | undefined,
            searchTokens: invoiceSearchTokens({
              invoiceNumber,
              customerName: validatedData.customerName,
              customerPhone: validatedData.customerPhone,
            }),
            createdAt: now,
            updatedAt: now,
          };

          const adjustedIds = await applyInventoryAdjustments(
            db,
            userId,
            getInventoryDiffAdjustments([], normalizedItems),
            session
          );
          adjustedIds.forEach((itemId) => changedInventoryIds.add(itemId));

          if (validatedData.addToLedger && customerId) {
            const debitTx = await transactionsCollection.insertOne(
              {
                userId,
                entityType: 'customer',
                entityId: customerId,
                customerId,
                type: 'debit',
                amount: totalAmount,
                description: `Invoice ${invoiceNumber} - Amount due`,
                date: now,
                createdAt: now,
              },
              { session }
            );
            invoiceDoc.transactionId = debitTx.insertedId.toString();

            if (validatedData.paidAmount > 0) {
              await transactionsCollection.insertOne(
                {
                  userId,
                  entityType: 'customer',
                  entityId: customerId,
                  customerId,
                  type: 'credit',
                  amount: validatedData.paidAmount,
                  description: `Invoice ${invoiceNumber} - Payment received`,
                  date: now,
                  createdAt: now,
                },
                { session }
              );
            }

            invoiceDoc.addedToLedger = true;
          }

          const result = await invoicesCollection.insertOne(invoiceDoc, { session });
          createdInvoice = {
            id: result.insertedId.toString(),
            ...invoiceDoc,
          };
        });

        break;
      } catch (error) {
        if (
          attempt < INVOICE_NUMBER_RETRY_ATTEMPTS &&
          isDuplicateInvoiceNumberError(error)
        ) {
          continue;
        }
        throw error;
      } finally {
        await session.endSession();
      }
    }

    if (!createdInvoice) {
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    await invalidateInvoiceCaches(db, userId, savedCustomerId, changedInventoryIds);

    return NextResponse.json(
      {
        message: 'Invoice created successfully',
        invoice: createdInvoice,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    if (error instanceof InvoiceStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    if (isDuplicateInvoiceNumberError(error)) {
      return NextResponse.json(
        {
          error: 'Could not allocate a unique invoice number. Please try again.',
          code: 'INVOICE_NUMBER_CONFLICT',
        },
        { status: 409 }
      );
    }

    console.error('Create invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
