import { NextRequest, NextResponse } from 'next/server';
import { Db, ObjectId } from 'mongodb';
import { z } from 'zod';
import clientPromise, { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { deriveInvoiceStatus, roundMoney } from '@/lib/invoice-calculations';
import {
  parsePaymentDate,
  reconcileInvoicePaymentHistory,
  removeInvoicePaymentCashEntry,
  replaceInvoicePaymentCashEntry,
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

const updatePaymentSchema = z.object({
  amount: z.number().finite().positive('Payment must be greater than zero'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must use YYYY-MM-DD'),
});

async function invalidate(db: Db, userId: string, customerId?: string) {
  try {
    await refreshUserReadModels(db, userId);
    await bumpCacheVersions(userId, ['invoices', 'dashboard', 'dailyCash', 'customers', 'search', 'bootstrap']);
    if (customerId) await redis.del(`ledger:customer:${customerId}:${userId}`);
  } catch (cacheError) {
    // Payment data is already committed at this point; cache failures are
    // recoverable and must not encourage a duplicate client retry.
    console.warn('Invoice payment cache invalidation failed:', cacheError);
  }
}

async function sellerForInvoice(db: any, invoice: any, userId: string, session: any) {
  if (isSellerSnapshotComplete(invoice.sellerSnapshot)) return invoice.sellerSnapshot;
  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) }, { session });
  const seller = user ? sellerSnapshotFromUser(user) : null;
  if (!isSellerSnapshotComplete(seller)) {
    throw new InvoiceStockError('FIRM_DETAILS_REQUIRED', 'Complete and save your firm details before changing a payment', 400);
  }
  return seller;
}

async function deleteOldPdf(publicId?: string, replacementId?: string) {
  if (!publicId || publicId === replacementId) return;
  try {
    const { deleteAsset } = await import('@/lib/cloudinary');
    await deleteAsset(publicId, 'raw');
  } catch (error) {
    console.error('Failed to delete replaced invoice payment PDF:', error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  let uploadedPdf: { url: string; publicId: string } | undefined;
  const uploadedPdfs: Array<{ url: string; publicId: string }> = [];
  let oldPdfPublicId: string | undefined;
  let customerId: string | undefined;

  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, paymentId } = await params;
    if (!ObjectId.isValid(id) || !ObjectId.isValid(paymentId)) {
      return NextResponse.json({ error: 'Invalid invoice or payment ID' }, { status: 400 });
    }
    const validated = updatePaymentSchema.parse(await request.json());
    let paymentDate: Date;
    try {
      paymentDate = parsePaymentDate(validated.date);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid payment date' }, { status: 400 });
    }

    const db = await getDb();
    const client = await clientPromise;
    const session = client.startSession();
    let updatedPayment: any;

    try {
      await session.withTransaction(async () => {
        const invoices = db.collection('invoices');
        const invoice = await invoices.findOne({ _id: new ObjectId(id), userId }, { session });
        if (!invoice) throw new InvoiceStockError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
        const paymentHistory = reconcileInvoicePaymentHistory(invoice);
        const payments = paymentHistory.payments;
        const index = payments.findIndex((payment: any) => payment.id === paymentId);
        if (index < 0) throw new InvoiceStockError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
        const payment = payments[index];
        if (payment.source === 'legacy') {
          throw new InvoiceStockError('LEGACY_PAYMENT_LOCKED', 'Historical payments are preserved and cannot be edited', 409);
        }

        customerId = invoice.customerId;
        oldPdfPublicId = invoice.pdfPublicId;
        const amount = roundMoney(validated.amount);
        const paidAmount = roundMoney(paymentHistory.paidAmount - Number(payment.amount || 0) + amount);
        if (paidAmount > invoice.totalAmount) {
          throw new InvoiceStockError('OVERPAYMENT', 'Payment cannot be greater than the remaining balance', 400);
        }
        const status = deriveInvoiceStatus(invoice.totalAmount, paidAmount);
        const sellerSnapshot = await sellerForInvoice(db, invoice, userId, session);
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

        let ledgerTransactionId = payment.ledgerTransactionId;
        if (ledgerTransactionId && ObjectId.isValid(ledgerTransactionId)) {
          await db.collection('transactions').updateOne(
            { _id: new ObjectId(ledgerTransactionId), userId },
            { $set: { amount, date: paymentDate } },
            { session }
          );
        } else if (invoice.addedToLedger && invoice.customerId) {
          const tx = await db.collection('transactions').insertOne({
            userId,
            entityType: 'customer',
            entityId: invoice.customerId,
            customerId: invoice.customerId,
            type: 'credit',
            amount,
            description: `Invoice ${invoice.invoiceNumber} - Payment received`,
            date: paymentDate,
            createdAt: new Date(),
          }, { session });
          ledgerTransactionId = tx.insertedId.toString();
        }

        const cashEntryId = payment.dailyCashEntryId || new ObjectId().toString();
        await replaceInvoicePaymentCashEntry(db, userId, {
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

        updatedPayment = {
          ...payment,
          amount,
          date: paymentDate,
          dailyCashEntryId: cashEntryId,
          ledgerTransactionId,
          updatedAt: new Date(),
        };
        payments[index] = updatedPayment;
        await invoices.updateOne({ _id: new ObjectId(id), userId }, {
          $set: {
            payments,
            paidAmount,
            status,
            sellerSnapshot,
            pdfUrl: uploadedPdf.url,
            pdfPublicId: uploadedPdf.publicId,
            pdfStatus: 'ready',
            pdfUpdatedAt: new Date(),
            updatedAt: new Date(),
          },
        }, { session });
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
    await deleteOldPdf(oldPdfPublicId, uploadedPdf?.publicId);
    return NextResponse.json({ message: 'Payment updated successfully', payment: updatedPayment });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    if (error instanceof InvoiceStockError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error('Update invoice payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  let uploadedPdf: { url: string; publicId: string } | undefined;
  const uploadedPdfs: Array<{ url: string; publicId: string }> = [];
  let oldPdfPublicId: string | undefined;
  let customerId: string | undefined;

  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, paymentId } = await params;
    if (!ObjectId.isValid(id) || !ObjectId.isValid(paymentId)) {
      return NextResponse.json({ error: 'Invalid invoice or payment ID' }, { status: 400 });
    }

    const db = await getDb();
    const client = await clientPromise;
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        const invoices = db.collection('invoices');
        const invoice = await invoices.findOne({ _id: new ObjectId(id), userId }, { session });
        if (!invoice) throw new InvoiceStockError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
        const paymentHistory = reconcileInvoicePaymentHistory(invoice);
        const payments = paymentHistory.payments;
        const payment = payments.find((candidate: any) => candidate.id === paymentId);
        if (!payment) throw new InvoiceStockError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
        if (payment.source === 'legacy') {
          throw new InvoiceStockError('LEGACY_PAYMENT_LOCKED', 'Historical payments are preserved and cannot be deleted', 409);
        }

        customerId = invoice.customerId;
        oldPdfPublicId = invoice.pdfPublicId;
        const paidAmount = roundMoney(Math.max(0, paymentHistory.paidAmount - Number(payment.amount || 0)));
        const status = deriveInvoiceStatus(invoice.totalAmount, paidAmount);
        const sellerSnapshot = await sellerForInvoice(db, invoice, userId, session);
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

        await removeInvoicePaymentCashEntry(db, userId, paymentId, session);
        if (payment.ledgerTransactionId && ObjectId.isValid(payment.ledgerTransactionId)) {
          await db.collection('transactions').deleteOne(
            { _id: new ObjectId(payment.ledgerTransactionId), userId },
            { session }
          );
        }
        await updateInvoiceCashEntryBills(db, userId, id, uploadedPdf.url, uploadedPdf.publicId, session);
        await invoices.updateOne({ _id: new ObjectId(id), userId }, {
          $set: {
            payments: payments.filter((candidate: any) => candidate.id !== paymentId),
            paidAmount,
            status,
            sellerSnapshot,
            pdfUrl: uploadedPdf.url,
            pdfPublicId: uploadedPdf.publicId,
            pdfStatus: 'ready',
            pdfUpdatedAt: new Date(),
            updatedAt: new Date(),
          },
        }, { session });
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
    await deleteOldPdf(oldPdfPublicId, uploadedPdf?.publicId);
    return NextResponse.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    if (error instanceof InvoiceStockError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error('Delete invoice payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
