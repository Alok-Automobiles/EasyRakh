import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { bumpCacheVersions } from '@/lib/cache-version';
import { refreshUserReadModels } from '@/lib/read-models';

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

    const db = await getDb();
    const transactionsCollection = db.collection('transactions');
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');

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

    const transactionDate = validatedData.date
      ? new Date(validatedData.date)
      : new Date();

    const billUrl = validatedData.billUrl?.trim();
    const billPublicId = validatedData.billPublicId?.trim();

    const result = await transactionsCollection.insertOne({
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
    });

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
          id: result.insertedId.toString(),
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
