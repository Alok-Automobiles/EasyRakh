import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { Db, ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { invalidateInventoryCache } from '@/lib/cache';
import { bumpCacheVersions } from '@/lib/cache-version';
import { invoiceSearchTokens } from '@/lib/search-normalization';
import { refreshUserReadModels } from '@/lib/read-models';
import {
  applyInventoryAdjustments,
  areInvoiceItemsUnchanged,
  getInventoryDiffAdjustments,
  getInventoryRestoreAdjustments,
  InvoiceStockError,
  normalizeInvoiceItemsForSave,
} from '@/lib/invoice-stock';
import type { InvoiceItem } from '@/lib/types';
import {
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  INVOICE_PRICING_VERSION,
} from '@/lib/invoice-calculations';
import {
  reconcileInvoicePaymentHistory,
  removeInvoiceCashEntries,
  updateInvoiceCashEntryBills,
} from '@/lib/invoice-payments';
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
  totalCogs?: number;
  costedSales?: number;
  uncostedSales?: number;
  missingCostItemCount?: number;
  grossProfit?: number;
  grossMargin?: number;
  pricingVersion?: number;
  paidAmount: number;
  payments?: any[];
  status: 'paid' | 'unpaid' | 'partial';
  notes?: string;
  addedToLedger: boolean;
  transactionId?: string;
  sellerSnapshot?: any;
  pdfUrl?: string;
  pdfPublicId?: string;
  pdfStatus?: string;
  pdfUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

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
        totalCogs: invoice.totalCogs,
        costedSales: invoice.costedSales,
        uncostedSales: invoice.uncostedSales,
        missingCostItemCount: invoice.missingCostItemCount,
        grossProfit: invoice.grossProfit,
        grossMargin: invoice.grossMargin,
        pricingVersion: invoice.pricingVersion,
        paidAmount: invoice.paidAmount,
        payments: invoice.payments || [],
        status: invoice.status,
        notes: invoice.notes,
        addedToLedger: invoice.addedToLedger,
        transactionId: invoice.transactionId,
        pdfUrl: invoice.pdfUrl,
        pdfPublicId: invoice.pdfPublicId,
        pdfStatus: invoice.pdfStatus,
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
    const usersCollection = db.collection('users');
    const client = await clientPromise;
    const session = client.startSession();
    const objectId = new ObjectId(id);
    const changedInventoryIds = new Set<string>();
    let updatedInvoice: InvoiceRecord | null = null;
    let cacheCustomerId: string | undefined;
    let uploadedPdf: { url: string; publicId: string } | undefined;
    const uploadedPdfs: Array<{ url: string; publicId: string }> = [];
    let oldPdfPublicId: string | undefined;

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
        oldPdfPublicId = existingInvoice.pdfPublicId;
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

        const previousItems = (existingInvoice.items || []) as InvoiceItem[];
        let nextItems = previousItems;

        if (
          validatedData.items !== undefined &&
          !areInvoiceItemsUnchanged(previousItems, validatedData.items)
        ) {
          nextItems = await normalizeInvoiceItemsForSave(
            db,
            userId,
            validatedData.items,
            session
          );
          updateFields.items = nextItems;

          const adjustedIds = await applyInventoryAdjustments(
            db,
            userId,
            getInventoryDiffAdjustments(previousItems, nextItems),
            session
          );
          adjustedIds.forEach((itemId) => changedInventoryIds.add(itemId));
        }

        const invoiceTotals = calculateInvoiceTotals(nextItems);
        const totalAmount = invoiceTotals.totalAmount;
        const paymentHistory = reconcileInvoicePaymentHistory(existingInvoice);
        const payments = paymentHistory.payments;
        const paidAmount = paymentHistory.paidAmount;
        if (paymentHistory.changed) updateFields.payments = payments;

        if (
          validatedData.paidAmount !== undefined &&
          validatedData.paidAmount !== paidAmount
        ) {
          throw new InvoiceStockError(
            'USE_PAYMENT_HISTORY',
            'Use Add Payment or the payment history to change the paid amount',
            400
          );
        }
        if (paidAmount > totalAmount) {
          throw new InvoiceStockError(
            'TOTAL_BELOW_PAID',
            'Invoice total cannot be reduced below the amount already paid',
            409
          );
        }
        const status = deriveInvoiceStatus(totalAmount, paidAmount);

        Object.assign(updateFields, invoiceTotals, {
          totalAmount,
          pricingVersion: INVOICE_PRICING_VERSION,
        });
        updateFields.paidAmount = paidAmount;
        updateFields.status = status;
        updateFields.searchTokens = invoiceSearchTokens({
          invoiceNumber: existingInvoice.invoiceNumber,
          customerName: String(updateFields.customerName || existingInvoice.customerName || ''),
          customerPhone: String(updateFields.customerPhone || existingInvoice.customerPhone || ''),
        });

        const now = new Date();
        let nextPayments = payments;

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

          if (payments.length > 0) {
            nextPayments = [];
            for (const payment of payments) {
              const paymentTx = await transactionsCollection.insertOne({
                userId,
                entityType: 'customer',
                entityId: existingInvoice.customerId,
                customerId: existingInvoice.customerId,
                type: 'credit',
                amount: payment.amount,
                description: `Invoice ${existingInvoice.invoiceNumber} - Payment received`,
                date: payment.date || now,
                createdAt: now,
              }, { session });
              nextPayments.push({ ...payment, ledgerTransactionId: paymentTx.insertedId.toString() });
            }
            updateFields.payments = nextPayments;
          } else if (paidAmount > 0) {
            await transactionsCollection.insertOne({
              userId,
              entityType: 'customer',
              entityId: existingInvoice.customerId,
              customerId: existingInvoice.customerId,
              type: 'credit',
              amount: paidAmount,
              description: `Invoice ${existingInvoice.invoiceNumber} - Payment received`,
              date: now,
              createdAt: now,
            }, { session });
          }

          updateFields.addedToLedger = true;
        }

        if (existingInvoice.addedToLedger && existingInvoice.customerId) {
          if (existingInvoice.totalAmount !== totalAmount) {
            const transactionId = existingInvoice.transactionId;
            const result = transactionId && ObjectId.isValid(transactionId)
              ? await transactionsCollection.updateOne(
                  { _id: new ObjectId(transactionId), userId },
                  { $set: { amount: totalAmount } },
                  { session }
                )
              : { matchedCount: 0 };
            if (!result.matchedCount) {
              const debitTx = await transactionsCollection.insertOne({
                userId,
                entityType: 'customer',
                entityId: existingInvoice.customerId,
                customerId: existingInvoice.customerId,
                type: 'debit',
                amount: totalAmount,
                description: `Invoice ${existingInvoice.invoiceNumber} - Amount due`,
                date: existingInvoice.createdAt || now,
                createdAt: now,
              }, { session });
              updateFields.transactionId = debitTx.insertedId.toString();
            }
          }
        }

        let sellerSnapshot = existingInvoice.sellerSnapshot;
        if (!isSellerSnapshotComplete(sellerSnapshot)) {
          const user = await usersCollection.findOne({ _id: new ObjectId(userId) }, { session });
          sellerSnapshot = user ? sellerSnapshotFromUser(user) : null;
        }
        if (!isSellerSnapshotComplete(sellerSnapshot)) {
          throw new InvoiceStockError(
            'FIRM_DETAILS_REQUIRED',
            'Complete and save your firm details before updating this invoice',
            400
          );
        }
        updateFields.sellerSnapshot = sellerSnapshot;

        const nextCustomerName = String(updateFields.customerName ?? existingInvoice.customerName);
        const nextCustomerPhone = String(updateFields.customerPhone ?? existingInvoice.customerPhone ?? '');
        const nextCustomerAddress = String(updateFields.customerAddress ?? existingInvoice.customerAddress ?? '');
        const nextNotes = String(updateFields.notes ?? existingInvoice.notes ?? '');
        uploadedPdf = await uploadInvoicePdf(userId, {
          invoiceNumber: existingInvoice.invoiceNumber,
          customerName: nextCustomerName,
          customerPhone: nextCustomerPhone,
          customerAddress: nextCustomerAddress,
          items: nextItems,
          totalAmount,
          paidAmount,
          status,
          notes: nextNotes,
          createdAt: existingInvoice.createdAt,
          sellerSnapshot,
        });
        uploadedPdfs.push(uploadedPdf);
        updateFields.pdfUrl = uploadedPdf.url;
        updateFields.pdfPublicId = uploadedPdf.publicId;
        updateFields.pdfStatus = 'ready';
        updateFields.pdfUpdatedAt = now;
        await updateInvoiceCashEntryBills(
          db,
          userId,
          id,
          uploadedPdf.url,
          uploadedPdf.publicId,
          session
        );

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
    } catch (error) {
      if (!transactionCommitMayBeUnknown(error)) {
        await cleanupInvoicePdfUploads(uploadedPdfs, undefined, 'uncommitted replacement PDF');
      }
      throw error;
    } finally {
      await session.endSession();
    }

    const invoiceForResponse = updatedInvoice as InvoiceRecord | null;

    if (!invoiceForResponse) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await invalidateInvoiceCaches(db, userId, cacheCustomerId, changedInventoryIds);
    await cleanupInvoicePdfUploads(uploadedPdfs, uploadedPdf?.publicId, 'retried replacement PDF upload');

    if (oldPdfPublicId && oldPdfPublicId !== uploadedPdf?.publicId) {
      try {
        const { deleteAsset } = await import('@/lib/cloudinary');
        await deleteAsset(oldPdfPublicId, 'raw');
      } catch (cleanupError) {
        console.error('Failed to delete replaced invoice PDF:', cleanupError);
      }
    }

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
        totalCogs: invoiceForResponse.totalCogs,
        costedSales: invoiceForResponse.costedSales,
        uncostedSales: invoiceForResponse.uncostedSales,
        missingCostItemCount: invoiceForResponse.missingCostItemCount,
        grossProfit: invoiceForResponse.grossProfit,
        grossMargin: invoiceForResponse.grossMargin,
        pricingVersion: invoiceForResponse.pricingVersion,
        paidAmount: invoiceForResponse.paidAmount,
        payments: invoiceForResponse.payments || [],
        status: invoiceForResponse.status,
        notes: invoiceForResponse.notes,
        addedToLedger: invoiceForResponse.addedToLedger,
        transactionId: invoiceForResponse.transactionId,
        pdfUrl: invoiceForResponse.pdfUrl,
        pdfPublicId: invoiceForResponse.pdfPublicId,
        pdfStatus: invoiceForResponse.pdfStatus,
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
    let deletedPdfPublicId: string | undefined;

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
        deletedPdfPublicId = invoice.pdfPublicId;
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

        await removeInvoiceCashEntries(db, userId, id, session);
        await invoicesCollection.deleteOne({ _id: objectId, userId }, { session });
      });
    } finally {
      await session.endSession();
    }

    await invalidateInvoiceCaches(db, userId, cacheCustomerId, changedInventoryIds);

    if (deletedPdfPublicId) {
      try {
        const { deleteAsset } = await import('@/lib/cloudinary');
        await deleteAsset(deletedPdfPublicId, 'raw');
      } catch (cleanupError) {
        console.error('Failed to delete invoice PDF after invoice deletion:', cleanupError);
      }
    }

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
