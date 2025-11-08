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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = await getDb();
    const transactionsCollection = db.collection('transactions');

    const transaction = await transactionsCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      transaction: {
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
      },
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
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

    const result = await transactionsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId,
      },
      {
        $set: {
          entityType: validatedData.entityType,
          entityId: validatedData.entityId,
          customerId: validatedData.entityType === 'customer' ? validatedData.entityId : undefined,
          supplierId: validatedData.entityType === 'supplier' ? validatedData.entityId : undefined,
          type: validatedData.type,
          amount: validatedData.amount,
          description: validatedData.description || '',
          date: transactionDate,
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Transaction updated successfully',
      transaction: {
        id: id,
        entityType: validatedData.entityType,
        entityId: validatedData.entityId,
        type: validatedData.type,
        amount: validatedData.amount,
        description: validatedData.description,
        date: transactionDate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Update transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = await getDb();
    const transactionsCollection = db.collection('transactions');

    const result = await transactionsCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Transaction deleted successfully',
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

