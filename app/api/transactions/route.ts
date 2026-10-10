import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { Document, ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { bumpCacheVersions } from '@/lib/cache-version';
import { refreshUserReadModels } from '@/lib/read-models';
import { createSupplierPayment, saveSupplierBill, supplierTransactionFields } from '@/lib/supplier-payments';
import { supplierPaymentsEnabled } from '@/lib/supplier-payment-settings';
import { supplierPaymentError } from '@/app/api/supplier-payments/shared';
import { BusinessCashError } from '@/lib/business-cash';
import { ensureTransactionIdempotencyIndex } from '@/lib/transaction-idempotency';

const transactionSchema = z
  .object({
    entityType: z.string().min(1, 'Entity type is required'),
    entityId: z.string().min(1, 'Entity is required'),
    type: z.enum(['credit', 'debit']),
    amount: z.number().positive('Amount must be positive'),
    description: z.string().optional(),
    date: z.string().or(z.date()),
    billUrl: z.union([z.string().url('Invalid bill URL'), z.literal('')]).optional(),
    billPublicId: z.string().optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine(
    (data) => {
      if (data.billUrl && data.billUrl !== '' && !data.billPublicId) {
        return false;
      }
      return true;
    },
    {
      message: 'billPublicId is required when billUrl is provided',
      path: ['billPublicId'],
    }
  );

function transactionPayload(transaction: Document) {
  return {
    id: transaction._id.toString(),
    entityType: transaction.entityType,
    entityId: transaction.entityId,
    type: transaction.type,
    amount: transaction.amount,
    description: transaction.description,
    billUrl: transaction.billUrl,
    billPublicId: transaction.billPublicId,
    date: transaction.date,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const entityType = searchParams.get('entityType');
    const type = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    const pageParam = Number(searchParams.get('page') || '1');
    const limitParam = Number(searchParams.get('limit') || '50');
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const limit = Number.isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 100);
    const skip = (page - 1) * limit;

    const db = await getDb();
    const transactionsCollection = db.collection('transactions');

    type TransactionQuery = {
      userId: string;
      entityId?: string;
      entityType?: string;
      type?: string;
      date?: {
        $gte?: Date;
        $lte?: Date;
      };
    };

    const query: TransactionQuery = { userId };
    if (entityId) {
      query.entityId = entityId;
    }
    if (entityType) {
      query.entityType = entityType;
    }
    if (type) {
      query.type = type;
    }
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const [total, transactions] = await Promise.all([
      transactionsCollection.countDocuments(query),
      transactionsCollection
        .find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      transactions: transactions.map((transaction) => ({
        id: transaction._id.toString(),
        entityType: transaction.entityType || 'customer',
        entityId: transaction.entityId || transaction.customerId || transaction.supplierId,
        customerId: transaction.customerId || (transaction.entityType === 'customer' ? transaction.entityId : undefined),
        supplierId: transaction.supplierId || (transaction.entityType === 'supplier' ? transaction.entityId : undefined),
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description,
        billUrl: transaction.billUrl,
        billPublicId: transaction.billPublicId,
        date: transaction.date,
        createdAt: transaction.createdAt,
        ...supplierTransactionFields(transaction),
      })),
      pagination: {
        total,
        page,
        pageSize: limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = transactionSchema.parse(body);

    if (validatedData.entityType === 'supplier') {
      if (validatedData.type === 'credit' && body.invoiceNumber !== undefined) {
        return NextResponse.json({ message: 'Transaction created successfully', transaction: await saveSupplierBill(userId, { ...body, ...validatedData }) }, { status: 201 });
      }
      if (validatedData.type === 'debit' && supplierPaymentsEnabled()) {
        if (!body.paymentAllocations && body.previousBalanceCashAmount === undefined) throw new BusinessCashError('Record supplier payments from the supplier ledger and allocate them to bills or Previous Balance', 400);
        return NextResponse.json({ message: 'Transaction created successfully', transaction: await createSupplierPayment(userId, { ...body, supplierId: validatedData.entityId }) }, { status: 201 });
      }
      if (validatedData.type === 'credit' && supplierPaymentsEnabled()) {
        throw new BusinessCashError('Add supplier purchases from the supplier ledger with an invoice number, invoice date, and due date', 400);
      }
      if (body.paymentAllocations !== undefined) throw new BusinessCashError('Supplier payments are disabled', 409);
    }

    const db = await getDb();
    const transactionsCollection = db.collection('transactions');
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');

    const transactionDate = validatedData.date
      ? new Date(validatedData.date)
      : new Date();
    if (Number.isNaN(transactionDate.getTime())) throw new BusinessCashError('Invalid transaction date', 400);
    const billUrl = validatedData.billUrl?.trim();
    const billPublicId = validatedData.billPublicId?.trim();
    const requestHash = createHash('sha256').update(JSON.stringify({
      entityType: validatedData.entityType,
      entityId: validatedData.entityId,
      type: validatedData.type,
      amount: validatedData.amount,
      description: validatedData.description || '',
      billUrl: billUrl || '',
      billPublicId: billPublicId || '',
      date: transactionDate.toISOString(),
    })).digest('hex');

    if (validatedData.idempotencyKey) {
      await ensureTransactionIdempotencyIndex(db);
      const previous = await transactionsCollection.findOne({
        userId,
        transactionRequestId: validatedData.idempotencyKey,
      });
      if (previous) {
        if (previous.transactionRequestHash !== requestHash) {
          throw new BusinessCashError('This request was already used for a different transaction', 409);
        }
        return NextResponse.json({ message: 'Transaction already created', transaction: transactionPayload(previous) });
      }
    }

    let entity;
    let entityDisplayName = 'Entity';
    
    if (validatedData.entityType === 'customer') {
      entity = await customersCollection.findOne({
        _id: new ObjectId(validatedData.entityId),
        userId,
      });
      entityDisplayName = 'Customer';
    } else if (validatedData.entityType === 'supplier') {
      entity = await suppliersCollection.findOne({
        _id: new ObjectId(validatedData.entityId),
        userId,
      });
      entityDisplayName = 'Supplier';
    } else {
      entity = await customEntitiesCollection.findOne({
        _id: new ObjectId(validatedData.entityId),
        collectionType: validatedData.entityType,
        userId,
      });
      const collectionTypesCollection = db.collection('collectionTypes');
      const collectionType = await collectionTypesCollection.findOne({
        userId,
        slug: validatedData.entityType,
      });
      entityDisplayName = collectionType?.name || 'Entity';
    }

    if (!entity) {
      return NextResponse.json(
        { error: `${entityDisplayName} not found` },
        { status: 404 }
      );
    }

    const document = {
      userId,
      entityType: validatedData.entityType,
      entityId: validatedData.entityId,
      customerId: validatedData.entityType === 'customer' ? validatedData.entityId : undefined,
      supplierId: validatedData.entityType === 'supplier' ? validatedData.entityId : undefined,
      type: validatedData.type,
      amount: validatedData.amount,
      description: validatedData.description || '',
      billUrl: billUrl || undefined,
      billPublicId: billPublicId || undefined,
      date: transactionDate,
      createdAt: new Date(),
      ...(validatedData.idempotencyKey ? {
        transactionRequestId: validatedData.idempotencyKey,
        transactionRequestHash: requestHash,
      } : {}),
    };
    let insertedId: ObjectId;
    try {
      ({ insertedId } = await transactionsCollection.insertOne(document));
    } catch (error) {
      if (!(validatedData.idempotencyKey && typeof error === 'object' && error && 'code' in error && error.code === 11000)) throw error;
      const previous = await transactionsCollection.findOne({ userId, transactionRequestId: validatedData.idempotencyKey });
      if (!previous || previous.transactionRequestHash !== requestHash) {
        throw new BusinessCashError('This request was already used for a different transaction', 409);
      }
      return NextResponse.json({ message: 'Transaction already created', transaction: transactionPayload(previous) });
    }

    const namespaces = validatedData.entityType === 'customer'
      ? ['dashboard', 'customers', 'bootstrap'] as const
      : validatedData.entityType === 'supplier'
        ? ['dashboard', 'suppliers', 'bootstrap'] as const
        : ['dashboard', 'customEntities', 'bootstrap'] as const;

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, [...namespaces]),
      redis.del(`ledger:${validatedData.entityType}:${validatedData.entityId}:${userId}`),
    ]);

    return NextResponse.json(
      {
        message: 'Transaction created successfully',
        transaction: {
          id: insertedId.toString(),
          entityType: validatedData.entityType,
          entityId: validatedData.entityId,
          type: validatedData.type,
          amount: validatedData.amount,
          description: validatedData.description,
          billUrl: billUrl || undefined,
          billPublicId: billPublicId || undefined,
          date: transactionDate,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof BusinessCashError || (typeof error === 'object' && error && 'code' in error && error.code === 11000)) return supplierPaymentError(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Create transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
