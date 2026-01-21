import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { deleteAsset } from '@/lib/cloudinary';

const transactionSchema = z
  .object({
    entityType: z.enum(['customer', 'supplier']),
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
        billUrl: transaction.billUrl,
        billPublicId: transaction.billPublicId,
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

    const existingTransaction = await transactionsCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const oldTransaction = await transactionsCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!oldTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

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

    const billUrl = validatedData.billUrl?.trim();
    const billPublicId = validatedData.billPublicId?.trim();
    const existingPublicId = existingTransaction.billPublicId;
    const hasExistingBill = Boolean(existingPublicId);
    const billFieldsProvided =
      Object.prototype.hasOwnProperty.call(body, 'billUrl') ||
      Object.prototype.hasOwnProperty.call(body, 'billPublicId');
    const newPublicId = billUrl && billPublicId ? billPublicId : undefined;
    const removingBill = billFieldsProvided && hasExistingBill && (!billUrl || billUrl === '');
    const replacingBill = billFieldsProvided && hasExistingBill && newPublicId && existingPublicId !== newPublicId;

    if ((removingBill || replacingBill) && existingPublicId) {
      try {
        await deleteAsset(existingPublicId);
      } catch (error) {
        console.warn('Failed to delete existing bill asset:', error);
      }
    }

    const updateOperation: {
      $set: Record<string, unknown>;
      $unset?: Record<string, string>;
    } = {
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
    };

    if (billUrl && billPublicId) {
      updateOperation.$set.billUrl = billUrl;
      updateOperation.$set.billPublicId = billPublicId;
    } else if (removingBill && hasExistingBill) {
      updateOperation.$unset = { billUrl: '', billPublicId: '' };
    }

    const result = await transactionsCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId,
      },
      updateOperation
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Non-blocking cache invalidation
    const oldEntityId = oldTransaction.entityId || oldTransaction.customerId || oldTransaction.supplierId;
    const oldEntityType = oldTransaction.entityType || (oldTransaction.customerId ? 'customer' : 'supplier');
    const keysToDelete = [
      `dashboard:stats:${userId}`,
      `ledger:${validatedData.entityType}:${validatedData.entityId}:${userId}`,
    ];
    
    if (validatedData.entityType === 'customer') {
      keysToDelete.push(`customers:${userId}`);
    } else if (validatedData.entityType === 'supplier') {
      keysToDelete.push(`suppliers:${userId}`);
    } else {
      keysToDelete.push(`customEntities:${validatedData.entityType}:${userId}`);
    }
    
    if (oldEntityId !== validatedData.entityId || oldEntityType !== validatedData.entityType) {
      keysToDelete.push(`ledger:${oldEntityType}:${oldEntityId}:${userId}`);
      if (oldEntityType === 'customer') {
        keysToDelete.push(`customers:${userId}`);
      } else if (oldEntityType === 'supplier') {
        keysToDelete.push(`suppliers:${userId}`);
      } else {
        keysToDelete.push(`customEntities:${oldEntityType}:${userId}`);
      }
    }
    redis.del(...keysToDelete).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

    return NextResponse.json({
      message: 'Transaction updated successfully',
      transaction: {
        id: id,
        entityType: validatedData.entityType,
        entityId: validatedData.entityId,
        type: validatedData.type,
        amount: validatedData.amount,
        description: validatedData.description,
        billUrl: billUrl && billPublicId ? billUrl : removingBill ? undefined : existingTransaction.billUrl,
        billPublicId: billUrl && billPublicId ? billPublicId : removingBill ? undefined : existingTransaction.billPublicId,
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

    if (transaction.billPublicId) {
      try {
        await deleteAsset(transaction.billPublicId);
      } catch (error) {
        console.warn('Failed to delete bill asset during transaction delete:', error);
      }
    }

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

    // Non-blocking cache invalidation
    const entityId = transaction.entityId || transaction.customerId || transaction.supplierId;
    const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
    const keysToDelete = [
      `dashboard:stats:${userId}`,
      `ledger:${entityType}:${entityId}:${userId}`
    ];
    
    if (entityType === 'customer') {
      keysToDelete.push(`customers:${userId}`);
    } else if (entityType === 'supplier') {
      keysToDelete.push(`suppliers:${userId}`);
    } else {
      keysToDelete.push(`customEntities:${entityType}:${userId}`);
    }
    
    redis.del(...keysToDelete).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

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

