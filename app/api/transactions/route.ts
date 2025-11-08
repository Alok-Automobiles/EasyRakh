import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';

const transactionSchema = z.object({
  entityType: z.enum(['customer', 'supplier']),
  entityId: z.string().min(1, 'Entity is required'),
  type: z.enum(['credit', 'debit']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  date: z.string().or(z.date()),
});

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

    const db = await getDb();
    const transactionsCollection = db.collection('transactions');

    const query: any = { userId };
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

    const transactions = await transactionsCollection
      .find(query)
      .sort({ date: -1, createdAt: -1 })
      .toArray();

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
        date: transaction.date,
        createdAt: transaction.createdAt,
      })),
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

    // Verify entity exists and belongs to user
    let entity;
    if (validatedData.entityType === 'customer') {
      entity = await customersCollection.findOne({
        _id: new ObjectId(validatedData.entityId),
        userId,
      });
    } else {
      entity = await suppliersCollection.findOne({
        _id: new ObjectId(validatedData.entityId),
        userId,
      });
    }

    if (!entity) {
      return NextResponse.json(
        { error: `${validatedData.entityType === 'customer' ? 'Customer' : 'Supplier'} not found` },
        { status: 404 }
      );
    }

    const transactionDate = validatedData.date
      ? new Date(validatedData.date)
      : new Date();

    const result = await transactionsCollection.insertOne({
      userId,
      entityType: validatedData.entityType,
      entityId: validatedData.entityId,
      customerId: validatedData.entityType === 'customer' ? validatedData.entityId : undefined,
      supplierId: validatedData.entityType === 'supplier' ? validatedData.entityId : undefined,
      type: validatedData.type,
      amount: validatedData.amount,
      description: validatedData.description || '',
      date: transactionDate,
      createdAt: new Date(),
    });

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
          date: transactionDate,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
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

