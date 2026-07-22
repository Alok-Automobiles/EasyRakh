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
import {
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  INVOICE_PRICING_VERSION,
  roundMoney,
} from '@/lib/invoice-calculations';
import { addInvoicePaymentCashEntry, parsePaymentDate } from '@/lib/invoice-payments';
import {
  isSellerSnapshotComplete,
  sellerSnapshotFromUser,
  uploadInvoicePdf,
} from '@/lib/invoice-pdf';
import {
  cleanupInvoicePdfUploads,
  transactionCommitMayBeUnknown,
} from '@/lib/invoice-pdf-cleanup';

const invoiceItemSchema = z.object({
  id: z.string().trim().optional(),
  inventoryItemId: z.string().trim().optional(),
  itemNumber: z.string().trim().optional(),
  itemName: z.string().trim().min(1, 'Item name is required'),
  quantity: z.number().finite().positive('Quantity must be greater than zero'),
  amount: z.number().finite().positive('Amount must be greater than zero').optional(),
  unitPrice: z.number().finite().positive('Selling price must be greater than zero').optional(),
  unitCost: z.number().finite().min(0, 'Cost price cannot be negative').optional(),
}).refine((item) => item.unitPrice !== undefined || item.amount !== undefined, {
  message: 'Selling price is required',
});

const createInvoiceSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(100).optional(),
  customerId: z.string().optional(),
  customerName: z.string().min(1, 'Customer name is required'),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  paidAmount: z.number().min(0).default(0),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must use YYYY-MM-DD').optional(),
  status: z.enum(['paid', 'unpaid', 'partial']),
  notes: z.string().optional(),
  addToLedger: z.boolean().default(false),
  createCustomerIfNew: z.boolean().default(false),
});

type CreatedInvoiceResponse = { id: string } & Record<string, any>;

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
    await bumpCacheVersions(userId, ['invoices', 'dashboard', 'dailyCash', 'customers', 'inventory', 'search', 'bootstrap']);
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
        totalCogs: inv.totalCogs,
        costedSales: inv.costedSales,
        uncostedSales: inv.uncostedSales,
        missingCostItemCount: inv.missingCostItemCount,
        grossProfit: inv.grossProfit,
        grossMargin: inv.grossMargin,
        pricingVersion: inv.pricingVersion,
        paidAmount: inv.paidAmount,
        payments: inv.payments || [],
        status: inv.status,
        notes: inv.notes,
        addedToLedger: inv.addedToLedger,
        transactionId: inv.transactionId,
        pdfUrl: inv.pdfUrl,
        pdfPublicId: inv.pdfPublicId,
        pdfStatus: inv.pdfStatus,
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
    const usersCollection = db.collection('users');
    if (validatedData.clientRequestId) {
      const existingInvoice = await invoicesCollection.findOne({
        userId,
        clientRequestId: validatedData.clientRequestId,
      });
      if (existingInvoice) {
        return NextResponse.json({
          message: 'Invoice already created',
          invoice: { ...existingInvoice, id: existingInvoice._id.toString() },
        });
      }
    }
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    const sellerSnapshot = user ? sellerSnapshotFromUser(user) : null;
    if (!isSellerSnapshotComplete(sellerSnapshot)) {
      return NextResponse.json(
        {
          error: 'Complete and save your firm details before creating an invoice.',
          code: 'FIRM_DETAILS_REQUIRED',
        },
        { status: 400 }
      );
    }

    let paymentDate: Date;
    try {
      paymentDate = parsePaymentDate(validatedData.paymentDate);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid payment date' },
        { status: 400 }
      );
    }
    const client = await clientPromise;
    const changedInventoryIds = new Set<string>();
    let savedCustomerId: string | undefined;
    let createdInvoice: CreatedInvoiceResponse | undefined;

    for (let attempt = 1; attempt <= INVOICE_NUMBER_RETRY_ATTEMPTS; attempt += 1) {
      const session = client.startSession();
      changedInventoryIds.clear();
      savedCustomerId = undefined;
      createdInvoice = undefined;
      let uploadedPdfForAttempt: { url: string; publicId: string } | undefined;
      const uploadedPdfsForAttempt: Array<{ url: string; publicId: string }> = [];

      try {
        await session.withTransaction(async () => {
          const normalizedItems = await normalizeInvoiceItemsForSave(
            db,
            userId,
            validatedData.items,
            session
          );
          const invoiceTotals = calculateInvoiceTotals(normalizedItems);
          const totalAmount = invoiceTotals.totalAmount;
          const initialPaidAmount = roundMoney(validatedData.paidAmount);
          if (initialPaidAmount > totalAmount) {
            throw new InvoiceStockError(
              'OVERPAYMENT',
              'Payment cannot be greater than the invoice total',
              400
            );
          }
          const status = deriveInvoiceStatus(totalAmount, initialPaidAmount);

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
          const invoiceObjectId = new ObjectId();
          const paymentId = initialPaidAmount > 0 ? new ObjectId().toString() : undefined;
          const cashEntryId = initialPaidAmount > 0 ? new ObjectId().toString() : undefined;
          const invoiceDoc: Record<string, any> = {
            _id: invoiceObjectId,
            userId,
            clientRequestId: validatedData.clientRequestId,
            invoiceNumber,
            customerId: customerId || undefined,
            customerName: validatedData.customerName,
            customerPhone: validatedData.customerPhone || '',
            customerAddress: validatedData.customerAddress || '',
            items: normalizedItems,
            ...invoiceTotals,
            pricingVersion: INVOICE_PRICING_VERSION,
            paidAmount: initialPaidAmount,
            payments: [],
            status,
            notes: validatedData.notes || '',
            addedToLedger: false,
            transactionId: undefined as string | undefined,
            sellerSnapshot,
            pdfUrl: '',
            pdfPublicId: '',
            pdfStatus: 'missing',
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

          let paymentLedgerTransactionId: string | undefined;
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
                date: paymentDate,
                createdAt: now,
              },
              { session }
            );
            invoiceDoc.transactionId = debitTx.insertedId.toString();

            if (initialPaidAmount > 0) {
              const paymentTx = await transactionsCollection.insertOne(
                {
                  userId,
                  entityType: 'customer',
                  entityId: customerId,
                  customerId,
                  type: 'credit',
                  amount: initialPaidAmount,
                  description: `Invoice ${invoiceNumber} - Payment received`,
                  date: paymentDate,
                  createdAt: now,
                },
                { session }
              );
              paymentLedgerTransactionId = paymentTx.insertedId.toString();
            }

            invoiceDoc.addedToLedger = true;
          }

          uploadedPdfForAttempt = await uploadInvoicePdf(userId, {
            invoiceNumber,
            customerName: validatedData.customerName,
            customerPhone: validatedData.customerPhone,
            customerAddress: validatedData.customerAddress,
            items: normalizedItems,
            totalAmount,
            paidAmount: initialPaidAmount,
            status,
            notes: validatedData.notes,
            createdAt: now,
            sellerSnapshot: sellerSnapshot!,
          });
          uploadedPdfsForAttempt.push(uploadedPdfForAttempt);
          invoiceDoc.pdfUrl = uploadedPdfForAttempt.url;
          invoiceDoc.pdfPublicId = uploadedPdfForAttempt.publicId;
          invoiceDoc.pdfStatus = 'ready';
          invoiceDoc.pdfUpdatedAt = now;

          if (paymentId && cashEntryId) {
            await addInvoicePaymentCashEntry(db, userId, {
              entryId: cashEntryId,
              paymentId,
              invoiceId: invoiceObjectId.toString(),
              invoiceNumber,
              amount: initialPaidAmount,
              date: paymentDate,
              customerName: validatedData.customerName,
              billUrl: invoiceDoc.pdfUrl,
              billPublicId: invoiceDoc.pdfPublicId,
            }, session);
            invoiceDoc.payments = [{
              id: paymentId,
              amount: initialPaidAmount,
              date: paymentDate,
              dailyCashEntryId: cashEntryId,
              ledgerTransactionId: paymentLedgerTransactionId,
              source: 'initial',
              createdAt: now,
              updatedAt: now,
            }];
          }

          await invoicesCollection.insertOne(invoiceDoc, { session });
          createdInvoice = {
            id: invoiceObjectId.toString(),
            ...invoiceDoc,
          };
        });

        await cleanupInvoicePdfUploads(
          uploadedPdfsForAttempt,
          uploadedPdfForAttempt?.publicId,
          'retried invoice PDF upload'
        );

        break;
      } catch (error) {
        if (!transactionCommitMayBeUnknown(error)) {
          await cleanupInvoicePdfUploads(uploadedPdfsForAttempt, undefined, 'uncommitted invoice PDF');
        }
        if (
          attempt < INVOICE_NUMBER_RETRY_ATTEMPTS &&
          isDuplicateInvoiceNumberError(error)
        ) {
          if (validatedData.clientRequestId) {
            const existingInvoice = await invoicesCollection.findOne({
              userId,
              clientRequestId: validatedData.clientRequestId,
            });
            if (existingInvoice) {
              createdInvoice = {
                ...existingInvoice,
                id: existingInvoice._id.toString(),
              };
              break;
            }
          }
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
