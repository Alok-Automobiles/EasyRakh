import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
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

    const existingInvoice = await invoicesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!existingInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

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
    if (validatedData.items !== undefined) {
      updateFields.items = validatedData.items;
      totalAmount = validatedData.items.reduce((sum, item) => sum + item.amount, 0);
      updateFields.totalAmount = totalAmount;
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
      const debitTx = await transactionsCollection.insertOne({
        userId,
        entityType: 'customer',
        entityId: existingInvoice.customerId,
        customerId: existingInvoice.customerId,
        type: 'debit',
        amount: totalAmount,
        description: `Invoice ${existingInvoice.invoiceNumber} - Amount due`,
        date: now,
        createdAt: now,
      });
      updateFields.transactionId = debitTx.insertedId.toString();

      if (paidAmount > 0) {
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
        });
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
        await transactionsCollection.deleteMany({
          userId,
          entityType: 'customer',
          entityId: existingInvoice.customerId,
          description: { $regex: `^Invoice ${existingInvoice.invoiceNumber}` },
        });
        
        const debitTx = await transactionsCollection.insertOne({
          userId,
          entityType: 'customer',
          entityId: existingInvoice.customerId,
          customerId: existingInvoice.customerId,
          type: 'debit',
          amount: newTotalAmount,
          description: `Invoice ${existingInvoice.invoiceNumber} - Amount due`,
          date: now,
          createdAt: now,
        });
        updateFields.transactionId = debitTx.insertedId.toString();
        
        if (newPaidAmount > 0) {
          await transactionsCollection.insertOne({
            userId,
            entityType: 'customer',
            entityId: existingInvoice.customerId,
            customerId: existingInvoice.customerId,
            type: 'credit',
            amount: newPaidAmount,
            description: `Invoice ${existingInvoice.invoiceNumber} - Payment received`,
            date: now,
            createdAt: now,
          });
        }
      }
    }

    await invoicesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const updatedInvoice = await invoicesCollection.findOne({
      _id: new ObjectId(id),
    });

    try {
      const keys = await redis.keys(`invoices:${userId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      if (existingInvoice.customerId) {
        await redis.del(
          `customers:${userId}`,
          `ledger:customer:${existingInvoice.customerId}:${userId}`,
          `dashboard:stats:${userId}`
        );
      }
    } catch (cacheError) {
      console.warn('Redis cache invalidation failed:', cacheError);
    }

    return NextResponse.json({
      message: 'Invoice updated successfully',
      invoice: {
        id: updatedInvoice!._id.toString(),
        invoiceNumber: updatedInvoice!.invoiceNumber,
        customerId: updatedInvoice!.customerId,
        customerName: updatedInvoice!.customerName,
        customerPhone: updatedInvoice!.customerPhone,
        customerAddress: updatedInvoice!.customerAddress,
        items: updatedInvoice!.items,
        totalAmount: updatedInvoice!.totalAmount,
        paidAmount: updatedInvoice!.paidAmount,
        status: updatedInvoice!.status,
        notes: updatedInvoice!.notes,
        addedToLedger: updatedInvoice!.addedToLedger,
        transactionId: updatedInvoice!.transactionId,
        createdAt: updatedInvoice!.createdAt,
        updatedAt: updatedInvoice!.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
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

    const invoice = await invoicesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const deleteTransactions = searchParams.get('deleteTransactions') === 'true';

    if (invoice.addedToLedger && deleteTransactions && invoice.customerId) {
      await transactionsCollection.deleteMany({
        userId,
        entityType: 'customer',
        entityId: invoice.customerId,
        description: { $regex: `^Invoice ${invoice.invoiceNumber}` },
      });
    }

    await invoicesCollection.deleteOne({ _id: new ObjectId(id) });

    try {
      const keys = await redis.keys(`invoices:${userId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      if (invoice.customerId) {
        await redis.del(
          `customers:${userId}`,
          `ledger:customer:${invoice.customerId}:${userId}`,
          `dashboard:stats:${userId}`
        );
      }
    } catch (cacheError) {
      console.warn('Redis cache invalidation failed:', cacheError);
    }

    return NextResponse.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
