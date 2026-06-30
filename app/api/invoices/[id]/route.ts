import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { invalidateInventoryCache } from '@/lib/cache';
import {
  applyInventoryAdjustments,
  getInventoryDiffAdjustments,
  getInventoryRestoreAdjustments,
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

const updateInvoiceSchema = z.object({
  customerName: z.string().min(1).optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
  paidAmount: z.number().min(0).optional(),
  status: z.enum(['paid', 'unpaid', 'partial']).optional(),
  notes: z.string().optional(),
  addToLedger: z.boolean().optional(),
});

type InvoiceRecord = {
  _id: { toString(): string };
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'unpaid' | 'partial';
  notes?: string;
  addedToLedger: boolean;
  transactionId?: string;
  createdAt: Date;
  updatedAt: Date;
};

async function invalidateInvoiceCaches(
  userId: string,
  customerId: string | undefined,
  changedInventoryIds: Set<string>
) {
  try {
    const keys = await redis.keys(`invoices:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    if (customerId) {
      await redis.del(
        `customers:${userId}`,
        `ledger:customer:${customerId}:${userId}`,
        `dashboard:stats:${userId}`
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');

    const invoice = await invoicesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({
      invoice: {
        id: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        customerAddress: invoice.customerAddress,
        items: invoice.items,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        status: invoice.status,
        notes: invoice.notes,
        addedToLedger: invoice.addedToLedger,
        transactionId: invoice.transactionId,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updateInvoiceSchema.parse(body);

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');
    const transactionsCollection = db.collection('transactions');
    const client = await clientPromise;
    const session = client.startSession();
    const objectId = new ObjectId(id);
    const changedInventoryIds = new Set<string>();
    let updatedInvoice: InvoiceRecord | null = null;
    let cacheCustomerId: string | undefined;

    try {
      await session.withTransaction(async () => {
        const existingInvoice = await invoicesCollection.findOne(
          {
            _id: objectId,
            userId,
          },
          { session }
        );

        if (!existingInvoice) {
          throw new InvoiceStockError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
        }

        cacheCustomerId = existingInvoice.customerId;
        const updateFields: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (validatedData.customerName !== undefined) {
          updateFields.customerName = validatedData.customerName;
        }
        if (validatedData.customerPhone !== undefined) {
          updateFields.customerPhone = validatedData.customerPhone;
        }
        if (validatedData.customerAddress !== undefined) {
          updateFields.customerAddress = validatedData.customerAddress;
        }
        if (validatedData.notes !== undefined) {
          updateFields.notes = validatedData.notes;
        }

        let totalAmount = existingInvoice.totalAmount;
        const previousItems = (existingInvoice.items || []) as InvoiceItem[];
        let nextItems = previousItems;

        if (validatedData.items !== undefined) {
          nextItems = await normalizeInvoiceItemsForSave(
            db,
            userId,
            validatedData.items,
            session
          );
          updateFields.items = nextItems;
          totalAmount = nextItems.reduce((sum, item) => sum + item.amount, 0);
          updateFields.totalAmount = totalAmount;

          const adjustedIds = await applyInventoryAdjustments(
            db,
            userId,
            getInventoryDiffAdjustments(previousItems, nextItems),
            session
          );
          adjustedIds.forEach((itemId) => changedInventoryIds.add(itemId));
        }

        let paidAmount = validatedData.paidAmount ?? existingInvoice.paidAmount;
        let status = validatedData.status ?? existingInvoice.status;

        if (paidAmount >= totalAmount) {
          status = 'paid';
        } else if (paidAmount > 0) {
          status = 'partial';
        } else {
          status = 'unpaid';
        }

        updateFields.paidAmount = paidAmount;
        updateFields.status = status;

        const now = new Date();

        if (validatedData.addToLedger && !existingInvoice.addedToLedger && existingInvoice.customerId) {
          const debitTx = await transactionsCollection.insertOne(
            {
              userId,
              entityType: 'customer',
              entityId: existingInvoice.customerId,
              customerId: existingInvoice.customerId,
              type: 'debit',
              amount: totalAmount,
              description: `Invoice ${existingInvoice.invoiceNumber} - Amount due`,
              date: now,
              createdAt: now,
            },
            { session }
          );
          updateFields.transactionId = debitTx.insertedId.toString();

          if (paidAmount > 0) {
            await transactionsCollection.insertOne(
              {
                userId,
                entityType: 'customer',
                entityId: existingInvoice.customerId,
                customerId: existingInvoice.customerId,
                type: 'credit',
                amount: paidAmount,
                description: `Invoice ${existingInvoice.invoiceNumber} - Payment received`,
                date: now,
                createdAt: now,
              },
              { session }
            );
          }

          updateFields.addedToLedger = true;
        }

        if (existingInvoice.addedToLedger && existingInvoice.customerId) {
          const oldTotalAmount = existingInvoice.totalAmount;
          const oldPaidAmount = existingInvoice.paidAmount;
          const newTotalAmount = totalAmount;
          const newPaidAmount = paidAmount;

          const totalChanged = oldTotalAmount !== newTotalAmount;
          const paidChanged = oldPaidAmount !== newPaidAmount;

          if (totalChanged || paidChanged) {
            await transactionsCollection.deleteMany(
              {
                userId,
                entityType: 'customer',
                entityId: existingInvoice.customerId,
                description: { $regex: `^Invoice ${existingInvoice.invoiceNumber}` },
              },
              { session }
            );

            const debitTx = await transactionsCollection.insertOne(
              {
                userId,
                entityType: 'customer',
                entityId: existingInvoice.customerId,
                customerId: existingInvoice.customerId,
                type: 'debit',
                amount: newTotalAmount,
                description: `Invoice ${existingInvoice.invoiceNumber} - Amount due`,
                date: now,
                createdAt: now,
              },
              { session }
            );
            updateFields.transactionId = debitTx.insertedId.toString();

            if (newPaidAmount > 0) {
              await transactionsCollection.insertOne(
                {
                  userId,
                  entityType: 'customer',
                  entityId: existingInvoice.customerId,
                  customerId: existingInvoice.customerId,
                  type: 'credit',
                  amount: newPaidAmount,
                  description: `Invoice ${existingInvoice.invoiceNumber} - Payment received`,
                  date: now,
                  createdAt: now,
                },
                { session }
              );
            }
          }
        }

        await invoicesCollection.updateOne(
          { _id: objectId, userId },
          { $set: updateFields },
          { session }
        );

        updatedInvoice = (await invoicesCollection.findOne(
          {
            _id: objectId,
            userId,
          },
          { session }
        )) as InvoiceRecord | null;
      });
    } finally {
      await session.endSession();
    }

    const invoiceForResponse = updatedInvoice as InvoiceRecord | null;

    if (!invoiceForResponse) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await invalidateInvoiceCaches(userId, cacheCustomerId, changedInventoryIds);

    return NextResponse.json({
      message: 'Invoice updated successfully',
      invoice: {
        id: invoiceForResponse._id.toString(),
        invoiceNumber: invoiceForResponse.invoiceNumber,
        customerId: invoiceForResponse.customerId,
        customerName: invoiceForResponse.customerName,
        customerPhone: invoiceForResponse.customerPhone,
        customerAddress: invoiceForResponse.customerAddress,
        items: invoiceForResponse.items,
        totalAmount: invoiceForResponse.totalAmount,
        paidAmount: invoiceForResponse.paidAmount,
        status: invoiceForResponse.status,
        notes: invoiceForResponse.notes,
        addedToLedger: invoiceForResponse.addedToLedger,
        transactionId: invoiceForResponse.transactionId,
        createdAt: invoiceForResponse.createdAt,
        updatedAt: invoiceForResponse.updatedAt,
      },
    });
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

    console.error('Update invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');
    const transactionsCollection = db.collection('transactions');
    const client = await clientPromise;
    const session = client.startSession();
    const objectId = new ObjectId(id);
    const { searchParams } = new URL(request.url);
    const deleteTransactions = searchParams.get('deleteTransactions') === 'true';
    const changedInventoryIds = new Set<string>();
    let cacheCustomerId: string | undefined;

    try {
      await session.withTransaction(async () => {
        const invoice = await invoicesCollection.findOne(
          {
            _id: objectId,
            userId,
          },
          { session }
        );

        if (!invoice) {
          throw new InvoiceStockError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
        }

        cacheCustomerId = invoice.customerId;
        const adjustedIds = await applyInventoryAdjustments(
          db,
          userId,
          getInventoryRestoreAdjustments((invoice.items || []) as InvoiceItem[]),
          session
        );
        adjustedIds.forEach((itemId) => changedInventoryIds.add(itemId));

        if (invoice.addedToLedger && deleteTransactions && invoice.customerId) {
          await transactionsCollection.deleteMany(
            {
              userId,
              entityType: 'customer',
              entityId: invoice.customerId,
              description: { $regex: `^Invoice ${invoice.invoiceNumber}` },
            },
            { session }
          );
        }

        await invoicesCollection.deleteOne({ _id: objectId, userId }, { session });
      });
    } finally {
      await session.endSession();
    }

    await invalidateInvoiceCaches(userId, cacheCustomerId, changedInventoryIds);

    return NextResponse.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    if (error instanceof InvoiceStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }

    console.error('Delete invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
