import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { entityType, entityId } = await params;

    // Try to get from cache
    try {
      const cacheKey = `ledger:${entityType}:${entityId}:${userId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (cacheError) {
      // If Redis fails, continue to DB query
      console.warn('Redis cache read failed, falling back to DB:', cacheError);
    }

    const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection('transactions');

    // Get entity (customer, supplier, or custom entity)
    let entity;
    let entityDisplayName = 'Entity';
    
    if (entityType === 'customer') {
      entity = await customersCollection.findOne({
        _id: new ObjectId(entityId),
        userId,
      });
      entityDisplayName = 'Customer';
    } else if (entityType === 'supplier') {
      entity = await suppliersCollection.findOne({
        _id: new ObjectId(entityId),
        userId,
      });
      entityDisplayName = 'Supplier';
    } else {
      // Custom entity type
      entity = await customEntitiesCollection.findOne({
        _id: new ObjectId(entityId),
        collectionType: entityType,
        userId,
      });
      // Get collection type name for display
      const collectionTypesCollection = db.collection('collectionTypes');
      const collectionType = await collectionTypesCollection.findOne({
        userId,
        slug: entityType,
      });
      entityDisplayName = collectionType?.name || 'Entity';
    }

    if (!entity) {
      return NextResponse.json(
        { error: `${entityDisplayName} not found` },
        { status: 404 }
      );
    }

    // Get all transactions for this entity
    const transactions = await transactionsCollection
      .find({
        entityId: entityId,
        entityType: entityType,
        userId,
      })
      .sort({ date: 1, createdAt: 1 })
      .toArray();

    // Calculate running balance
    let runningBalance = entity.openingBalance;
    if (entity.balanceType === 'credit') {
      runningBalance = -runningBalance; // Credit is negative (you owe them)
    }

    const ledgerEntries = transactions.map((transaction) => {
      // Generic logic for all entity types:
      // Credit subtracts from balance, Debit adds to balance
      if (transaction.type === 'credit') {
        runningBalance -= transaction.amount;
      } else {
        runningBalance += transaction.amount;
      }

      return {
        transactionId: transaction._id.toString(),
        date: transaction.date,
        description: transaction.description || '',
        credit: transaction.type === 'credit' ? transaction.amount : 0,
        debit: transaction.type === 'debit' ? transaction.amount : 0,
        balance: runningBalance,
        billUrl: transaction.billUrl,
        billPublicId: transaction.billPublicId,
      };
    });

    // Calculate totals
    const totalCredit = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Final balance - generic logic for all entity types
    let finalBalance = entity.openingBalance;
    if (entity.balanceType === 'credit') {
      finalBalance = -finalBalance;
    }
    finalBalance = finalBalance - totalCredit + totalDebit;

    const responseData = {
      entity: {
        id: entity._id.toString(),
        name: entity.name,
        phone: entity.phone,
        email: entity.email,
        address: entity.address,
        openingBalance: entity.openingBalance,
        balanceType: entity.balanceType,
      },
      entityType: entityType,
      openingBalance: {
        amount: entity.openingBalance,
        type: entity.balanceType,
      },
      entries: ledgerEntries,
      totals: {
        credit: totalCredit,
        debit: totalDebit,
        balance: finalBalance,
      },
    };

    // Cache the response with 90 second TTL
    try {
      const cacheKey = `ledger:${entityType}:${entityId}:${userId}`;
      await redis.setex(cacheKey, 90, JSON.stringify(responseData));
    } catch (cacheError) {
      // If Redis fails, continue without caching
      console.warn('Redis cache write failed:', cacheError);
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get ledger error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
