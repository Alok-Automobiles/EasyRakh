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

/**
 * Generate next invoice number in format: INV-YYYY-MM-XXXX
 */
async function generateInvoiceNumber(db: ReturnType<Awaited<ReturnType<typeof getDb>>['collection']> extends never ? never : Awaited<ReturnType<typeof getDb>>, userId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INV-${year}-${month}-`;

  const invoicesCollection = db.collection('invoices');
  
  const latestInvoice = await invoicesCollection
    .find({
      userId,
      invoiceNumber: { $regex: `^${prefix}` },
    })
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

    const cacheKey = `invoices:${userId}:${customerId || ''}:${status || ''}:${search || ''}:${page}:${limit}`;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return NextResponse.json(JSON.parse(cachedData), { status: 200 });
      }
    } catch (cacheError) {
      console.warn('Redis cache read failed:', cacheError);
    }

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');

    type InvoiceQuery = {
      userId: string;
      customerId?: string;
      status?: string;
      $or?: Array<{ customerName?: { $regex: string; $options: string }; invoiceNumber?: { $regex: string; $options: string } }>;
    };

    const query: InvoiceQuery = { userId };
    
    if (customerId) {
      query.customerId = customerId;
    }
    if (status && ['paid', 'unpaid', 'partial'].includes(status)) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } },
      ];
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

    try {
      await redis.setex(cacheKey, 300, JSON.stringify(responseData));
    } catch (cacheError) {
      console.warn('Redis cache write failed:', cacheError);
    }

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

    const totalAmount = validatedData.items.reduce((sum, item) => sum + item.amount, 0);

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
      const customer = await customersCollection.findOne({
        _id: new ObjectId(customerId),
        userId,
      });
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
    } else if (validatedData.createCustomerIfNew) {
      const newCustomer = await customersCollection.insertOne({
        userId,
        name: validatedData.customerName,
        phone: validatedData.customerPhone || '',
        email: '',
        address: validatedData.customerAddress || '',
        openingBalance: 0,
        balanceType: 'debit',
        createdAt: new Date(),
      });
      customerId = newCustomer.insertedId.toString();
    }

    const invoiceNumber = await generateInvoiceNumber(db, userId);

    const now = new Date();
    const invoiceDoc = {
      userId,
      invoiceNumber,
      customerId: customerId || undefined,
      customerName: validatedData.customerName,
      customerPhone: validatedData.customerPhone || '',
      customerAddress: validatedData.customerAddress || '',
      items: validatedData.items,
      totalAmount,
      paidAmount: validatedData.paidAmount,
      status,
      notes: validatedData.notes || '',
      addedToLedger: false,
      transactionId: undefined as string | undefined,
      createdAt: now,
      updatedAt: now,
    };

    if (validatedData.addToLedger && customerId) {
      const debitTx = await transactionsCollection.insertOne({
        userId,
        entityType: 'customer',
        entityId: customerId,
        customerId,
        type: 'debit',
        amount: totalAmount,
        description: `Invoice ${invoiceNumber} - Amount due`,
        date: now,
        createdAt: now,
      });
      invoiceDoc.transactionId = debitTx.insertedId.toString();

      if (validatedData.paidAmount > 0) {
        await transactionsCollection.insertOne({
          userId,
          entityType: 'customer',
          entityId: customerId,
          customerId,
          type: 'credit',
          amount: validatedData.paidAmount,
          description: `Invoice ${invoiceNumber} - Payment received`,
          date: now,
          createdAt: now,
        });
      }

      invoiceDoc.addedToLedger = true;
    }

    const result = await invoicesCollection.insertOne(invoiceDoc);

    const cachesToInvalidate = [`invoices:${userId}:*`];
    if (customerId) {
      cachesToInvalidate.push(
        `customers:${userId}`,
        `ledger:customer:${customerId}:${userId}`,
        `dashboard:stats:${userId}`
      );
    }
    
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
    } catch (cacheError) {
      console.warn('Redis cache invalidation failed:', cacheError);
    }

    return NextResponse.json(
      {
        message: 'Invoice created successfully',
        invoice: {
          id: result.insertedId.toString(),
          ...invoiceDoc,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error('Create invoice error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
