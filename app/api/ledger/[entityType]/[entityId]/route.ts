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

    try {
      const cacheKey = `ledger:${entityType}:${entityId}:${userId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (cacheError) {
      console.warn('Redis cache read failed, falling back to DB:', cacheError);
    }

    const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection('transactions');

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
      entity = await customEntitiesCollection.findOne({
        _id: new ObjectId(entityId),
        collectionType: entityType,
        userId,
      });
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

    const transactions = await transactionsCollection
      .find({
        entityId: entityId,
        entityType: entityType,
        userId,
      })
      .sort({ date: 1, createdAt: 1 })
      .toArray();

    let runningBalance = entity.openingBalance;
    if (entity.balanceType === 'credit') {
      runningBalance = -runningBalance; // Credit is negative (you owe them)
    }

    const ledgerEntries = transactions.map((transaction) => {
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

    const totalCredit = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

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
        openingBalanceDescription: entity.openingBalanceDescription,
        openingBalanceBillUrl: entity.openingBalanceBillUrl,
        openingBalanceBillPublicId: entity.openingBalanceBillPublicId,
      },
      entityType: entityType,
      openingBalance: {
        amount: entity.openingBalance,
        type: entity.balanceType,
        description: entity.openingBalanceDescription,
        billUrl: entity.openingBalanceBillUrl,
        billPublicId: entity.openingBalanceBillPublicId,
      },
      openingBalanceDescription: entity.openingBalanceDescription,
      openingBalanceBillUrl: entity.openingBalanceBillUrl,
      entries: ledgerEntries,
      totals: {
        credit: totalCredit,
        debit: totalDebit,
        balance: finalBalance,
      },
    };

    try {
      const cacheKey = `ledger:${entityType}:${entityId}:${userId}`;
      await redis.setex(cacheKey, 180, JSON.stringify(responseData));
    } catch (cacheError) {
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
