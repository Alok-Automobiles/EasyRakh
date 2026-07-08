import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { type EntityBalance } from '@/lib/read-models';

const LEDGER_PAGE_INDEX_HINT = {
  userId: 1,
  entityType: 1,
  entityId: 1,
  date: 1,
  createdAt: 1,
  _id: 1,
} as const;

type LedgerCursor = {
  date: string;
  createdAt: string;
  id: string;
  balance: number;
};

function encodeLedgerCursor(cursor: LedgerCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeLedgerCursor(value: string | null): LedgerCursor | null {
  if (!value || /^\d+$/.test(value)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<LedgerCursor>;
    if (
      typeof parsed.date !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      typeof parsed.balance !== 'number'
    ) {
      return null;
    }
    return parsed as LedgerCursor;
  } catch {
    return null;
  }
}

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

    const searchParams = request.nextUrl.searchParams;
    const limitParam = Number(searchParams.get('limit') || '100');
    const rawCursor = searchParams.get('cursor');
    const cursorParam = Number(rawCursor || '0');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 500) : 100;
    const offsetCursor = rawCursor && /^\d+$/.test(rawCursor) && Number.isFinite(cursorParam)
      ? Math.max(Math.trunc(cursorParam), 0)
      : 0;
    const decodedCursor = decodeLedgerCursor(rawCursor);
    const pageCursor = decodedCursor &&
      ObjectId.isValid(decodedCursor.id) &&
      !Number.isNaN(new Date(decodedCursor.date).getTime()) &&
      !Number.isNaN(new Date(decodedCursor.createdAt).getTime())
      ? decodedCursor
      : null;

    const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection('transactions');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');

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

    const balanceDoc = await entityBalancesCollection.findOne({ userId, entityType, entityId });

    const transactionFilter: Record<string, unknown> = {
      entityId: entityId,
      entityType: entityType,
      userId,
    };

    if (pageCursor && ObjectId.isValid(pageCursor.id)) {
      const cursorDate = new Date(pageCursor.date);
      const cursorCreatedAt = new Date(pageCursor.createdAt);
      transactionFilter.$or = [
        { date: { $gt: cursorDate } },
        { date: cursorDate, createdAt: { $gt: cursorCreatedAt } },
        { date: cursorDate, createdAt: cursorCreatedAt, _id: { $gt: new ObjectId(pageCursor.id) } },
      ];
    }

    const getLedgerTransactions = (useHint: boolean) => {
      let transactionCursor = transactionsCollection.find(transactionFilter);
      if (useHint && typeof transactionCursor.hint === 'function') {
        transactionCursor = transactionCursor.hint(LEDGER_PAGE_INDEX_HINT);
      }
      return transactionCursor
        .sort({ date: 1, createdAt: 1, _id: 1 })
        .limit((offsetCursor || 0) + limit + 1)
        .toArray();
    };

    let transactionsForBalance;
    try {
      transactionsForBalance = await getLedgerTransactions(true);
    } catch (error) {
      console.warn('Ledger index hint failed, retrying without hint:', error);
      transactionsForBalance = await getLedgerTransactions(false);
    }

    let runningBalance = pageCursor?.balance ?? entity.openingBalance;
    if (!pageCursor && entity.balanceType === 'credit') {
      runningBalance = -runningBalance; // Credit is negative (you owe them)
    }

    const pageTransactions = offsetCursor > 0
      ? transactionsForBalance.slice(offsetCursor, offsetCursor + limit)
      : transactionsForBalance.slice(0, limit);

    const pageEntries = pageTransactions.map((transaction) => {
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

    const hasMore = transactionsForBalance.length > (offsetCursor || 0) + limit;
    const lastTransaction = pageTransactions[pageTransactions.length - 1];
    const nextCursor = hasMore && lastTransaction
      ? offsetCursor > 0
        ? String(offsetCursor + limit)
        : encodeLedgerCursor({
            date: lastTransaction.date.toISOString(),
            createdAt: (lastTransaction.createdAt || lastTransaction.date).toISOString(),
            id: lastTransaction._id.toString(),
            balance: runningBalance,
          })
      : undefined;
    const totalCredit = balanceDoc?.totalCredit ?? 0;
    const totalDebit = balanceDoc?.totalDebit ?? 0;

    let finalBalance = entity.openingBalance;
    if (entity.balanceType === 'credit') {
      finalBalance = -finalBalance;
    }
    finalBalance = balanceDoc?.totalBalance ?? (finalBalance - totalCredit + totalDebit);

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
      entries: pageEntries,
      totals: {
        credit: totalCredit,
        debit: totalDebit,
        balance: finalBalance,
      },
      pagination: {
        limit,
        nextCursor,
        hasMore,
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get ledger error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
