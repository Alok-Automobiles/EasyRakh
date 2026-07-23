import { NextRequest, NextResponse } from 'next/server';
import { Db, ObjectId } from 'mongodb';
import { z } from 'zod';
import clientPromise, { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { deriveInvoiceStatus, roundMoney } from '@/lib/invoice-calculations';
import {
  addInvoicePaymentCashEntry,
  parsePaymentDate,
  reconcileInvoicePaymentHistory,
  updateInvoiceCashEntryBills,
} from '@/lib/invoice-payments';
import { isSellerSnapshotComplete, sellerSnapshotFromUser, uploadInvoicePdf } from '@/lib/invoice-pdf';
import {
  cleanupInvoicePdfUploads,
  transactionCommitMayBeUnknown,
} from '@/lib/invoice-pdf-cleanup';
import { InvoiceStockError } from '@/lib/invoice-stock';
import { bumpCacheVersions } from '@/lib/cache-version';
import { refreshUserReadModels } from '@/lib/read-models';
import redis from '@/lib/redis';

const paymentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  amount: z.number().finite().positive('Payment must be greater than zero'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must use YYYY-MM-DD'),
});

async function invalidate(db: Db, userId: string, customerId?: string) {
  try {
    await refreshUserReadModels(db, userId);
    await bumpCacheVersions(userId, ['invoices', 'dashboard', 'dailyCash', 'customers', 'search', 'bootstrap']);
    if (customerId) await redis.del(`ledger:customer:${customerId}:${userId}`);
  } catch (cacheError) {
    // The financial transaction has already committed. A cache outage must not
    // turn a successful payment into a 500 that the client may retry.
    console.warn('Invoice payment cache invalidation failed:', cacheError);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedPdf: { url: string; publicId: string } | undefined;
  const uploadedPdfs: Array<{ url: string; publicId: string }> = [];
  let oldPdfPublicId: string | undefined;
  let customerId: string | undefined;

  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const validated = paymentSchema.parse(await request.json());
    let paymentDate: Date;
    try {
      paymentDate = parsePaymentDate(validated.date);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid payment date' }, { status: 400 });
    }

    const db = await getDb();
    const client = await clientPromise;
    const session = client.startSession();
    const invoiceObjectId = new ObjectId(id);
    let createdPayment: any;
    let paymentAlreadyExisted = false;

    try {
      await session.withTransaction(async () => {
        const invoices = db.collection('invoices');
        const invoice = await invoices.findOne({ _id: invoiceObjectId, userId }, { session });
        if (!invoice) throw new InvoiceStockError('INVOICE_NOT_FOUND', 'Invoice not found', 404);

        customerId = invoice.customerId;
        const paymentHistory = reconcileInvoicePaymentHistory(invoice);
        const existingPayment = validated.idempotencyKey
          ? paymentHistory.payments.find(
              (payment: any) => payment.idempotencyKey === validated.idempotencyKey
            )
          : undefined;
        if (existingPayment) {
          createdPayment = existingPayment;
          paymentAlreadyExisted = true;
          return;
        }
        oldPdfPublicId = invoice.pdfPublicId;
        const amount = roundMoney(validated.amount);
        const paidAmount = roundMoney(paymentHistory.paidAmount + amount);
        if (paidAmount > Number(invoice.totalAmount || 0)) {
          throw new InvoiceStockError('OVERPAYMENT', 'Payment cannot be greater than the remaining balance', 400);
        }

        let sellerSnapshot = invoice.sellerSnapshot;
        if (!isSellerSnapshotComplete(sellerSnapshot)) {
          const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, { session });
          sellerSnapshot = user ? sellerSnapshotFromUser(user) : null;
        }
        if (!isSellerSnapshotComplete(sellerSnapshot)) {
          throw new InvoiceStockError('FIRM_DETAILS_REQUIRED', 'Complete and save your firm details before adding a payment', 400);
        }

        const status = deriveInvoiceStatus(invoice.totalAmount, paidAmount);
        uploadedPdf = await uploadInvoicePdf(userId, {
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          customerPhone: invoice.customerPhone,
          customerAddress: invoice.customerAddress,
          items: invoice.items || [],
          totalAmount: invoice.totalAmount,
          paidAmount,
          status,
          notes: invoice.notes,
          createdAt: invoice.createdAt,
          sellerSnapshot,
        });
        uploadedPdfs.push(uploadedPdf);

        const paymentId = new ObjectId().toString();
        const cashEntryId = new ObjectId().toString();
        let ledgerTransactionId: string | undefined;
        const now = new Date();
        if (invoice.addedToLedger && invoice.customerId) {
          const tx = await db.collection('transactions').insertOne({
            userId,
            entityType: 'customer',
            entityId: invoice.customerId,
            customerId: invoice.customerId,
            type: 'credit',
            amount,
            description: `Invoice ${invoice.invoiceNumber} - Payment received`,
            date: paymentDate,
            createdAt: now,
          }, { session });
          ledgerTransactionId = tx.insertedId.toString();
        }

        await addInvoicePaymentCashEntry(db, userId, {
          entryId: cashEntryId,
          paymentId,
          invoiceId: id,
          invoiceNumber: invoice.invoiceNumber,
          amount,
          date: paymentDate,
          customerName: invoice.customerName,
          billUrl: uploadedPdf.url,
          billPublicId: uploadedPdf.publicId,
        }, session);
        await updateInvoiceCashEntryBills(db, userId, id, uploadedPdf.url, uploadedPdf.publicId, session);

        createdPayment = {
          id: paymentId,
          idempotencyKey: validated.idempotencyKey,
          amount,
          date: paymentDate,
          dailyCashEntryId: cashEntryId,
          ledgerTransactionId,
          source: 'added',
          createdAt: now,
          updatedAt: now,
        };
        await invoices.updateOne(
          { _id: invoiceObjectId, userId },
          {
            $set: {
              payments: [...paymentHistory.payments, createdPayment],
              paidAmount,
              status,
              sellerSnapshot,
              pdfUrl: uploadedPdf.url,
              pdfPublicId: uploadedPdf.publicId,
              pdfStatus: 'ready',
              pdfUpdatedAt: now,
              updatedAt: now,
            },
          },
          { session }
        );
      });
    } catch (error) {
      if (!transactionCommitMayBeUnknown(error)) {
        await cleanupInvoicePdfUploads(uploadedPdfs, undefined, 'uncommitted payment PDF');
      }
      throw error;
    } finally {
      await session.endSession();
    }

    await invalidate(db, userId, customerId);
    await cleanupInvoicePdfUploads(uploadedPdfs, uploadedPdf?.publicId, 'retried payment PDF upload');
    if (oldPdfPublicId && oldPdfPublicId !== uploadedPdf?.publicId) {
      try {
        const { deleteAsset } = await import('@/lib/cloudinary');
        await deleteAsset(oldPdfPublicId, 'raw');
      } catch (cleanupError) {
        console.error('Failed to delete replaced payment PDF:', cleanupError);
      }
    }

    return NextResponse.json(
      {
        message: paymentAlreadyExisted ? 'Payment already recorded' : 'Payment recorded successfully',
        payment: createdPayment,
      },
      { status: paymentAlreadyExisted ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    if (error instanceof InvoiceStockError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Add invoice payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
