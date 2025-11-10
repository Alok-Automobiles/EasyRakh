import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { ObjectId } from 'mongodb';

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

    if (entityType !== 'customer' && entityType !== 'supplier') {
      return NextResponse.json(
        { error: 'Invalid entity type' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const transactionsCollection = db.collection('transactions');

    // Get entity (customer or supplier)
    let entity;
    if (entityType === 'customer') {
      entity = await customersCollection.findOne({
        _id: new ObjectId(entityId),
        userId,
      });
    } else {
      entity = await suppliersCollection.findOne({
        _id: new ObjectId(entityId),
        userId,
      });
    }

    if (!entity) {
      return NextResponse.json(
        { error: `${entityType === 'customer' ? 'Customer' : 'Supplier'} not found` },
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
      // Entity-specific logic:
      // Suppliers: Credit subtracts (you owe more, balance more negative), Debit adds (you owe less, balance less negative)
      // Customers: Credit subtracts (they owe less), Debit adds (they owe more)
      if (entityType === 'supplier') {
        if (transaction.type === 'credit') {
          runningBalance -= transaction.amount; // Credit subtracts (you owe more, balance more negative)
        } else {
          runningBalance += transaction.amount; // Debit adds (you owe less, balance less negative)
        }
      } else {
        // customer
        if (transaction.type === 'credit') {
          runningBalance -= transaction.amount; // Credit subtracts (they owe less)
        } else {
          runningBalance += transaction.amount; // Debit adds (they owe more)
        }
      }

      return {
        date: transaction.date,
        description: transaction.description || '',
        credit: transaction.type === 'credit' ? transaction.amount : 0,
        debit: transaction.type === 'debit' ? transaction.amount : 0,
        balance: runningBalance,
      };
    });

    // Calculate totals
    const totalCredit = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Final balance
    let finalBalance = entity.openingBalance;
    if (entity.balanceType === 'credit') {
      finalBalance = -finalBalance;
    }
    // Entity-specific logic for transactions:
    // Suppliers: Credit subtracts (you owe more), Debit adds (you owe less)
    // Customers: Credit subtracts (they owe less), Debit adds (they owe more)
    if (entityType === 'supplier') {
      finalBalance = finalBalance - totalCredit + totalDebit;
    } else {
      // customer
      finalBalance = finalBalance - totalCredit + totalDebit;
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Get ledger error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

