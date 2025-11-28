import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { subDays } from 'date-fns';
import type { RecentActivity, Transaction } from '@/lib/types';
import redis from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to get from cache
    try {
      const cacheKey = `dashboard:stats:${userId}`;
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
    const transactionsCollection = db.collection<Transaction>('transactions');
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');
    const notesCollection = db.collection('notes');

    const normalizeToUTCStart = (date: Date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const dateKey = (date: Date) => normalizeToUTCStart(date).getTime();

    const today = normalizeToUTCStart(new Date());
    const thirtyDaysAgo = normalizeToUTCStart(subDays(today, 29));
    const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));

    // Fetch all data in parallel
    const [
      customers,
      suppliers,
      transactions,
      recentCustomers,
      recentSuppliers,
      recentDailyCashRecords,
      dashboardNotes,
    ] = await Promise.all([
      // All customers for balance calculation
      customersCollection.find({ userId }).toArray(),
      // All suppliers for balance calculation
      suppliersCollection.find({ userId }).toArray(),
      // All transactions for stats
      transactionsCollection.find({ userId }).toArray(),
      // Recent customers for activities (limit 20)
      customersCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      // Recent suppliers for activities (limit 20)
      suppliersCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      // Daily cash records for the last 30 days
      dailyCashRecordsCollection
        .find({
          userId,
          date: { $gte: thirtyDaysAgo, $lte: today },
        })
        .sort({ date: 1 })
        .toArray(),
      // Notes opted in for dashboard display
      notesCollection
        .find({ userId, showOnDashboard: true })
        .sort({ updatedAt: -1 })
        .limit(6)
        .toArray(),
    ]);

    // Calculate stats
    const totalCredit = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebit = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate net balance from customers' and suppliers' opening balances
    let netBalance = 0;
    for (const customer of customers) {
      if (customer.balanceType === 'credit') {
        netBalance -= customer.openingBalance;
      } else {
        netBalance += customer.openingBalance;
      }
    }
    for (const supplier of suppliers) {
      if (supplier.balanceType === 'credit') {
        netBalance -= supplier.openingBalance;
      } else {
        netBalance += supplier.openingBalance;
      }
    }

    // Add transactions to balance
    const customerTransactions = transactions.filter((t) => t.entityType === 'customer');
    const supplierTransactions = transactions.filter((t) => t.entityType === 'supplier');

    // Customer transactions: Credit subtracts, Debit adds
    for (const transaction of customerTransactions) {
      if (transaction.type === 'credit') {
        netBalance -= transaction.amount;
      } else {
        netBalance += transaction.amount;
      }
    }

    // Supplier transactions: Credit subtracts, Debit adds
    for (const transaction of supplierTransactions) {
      if (transaction.type === 'credit') {
        netBalance -= transaction.amount;
      } else {
        netBalance += transaction.amount;
      }
    }

    // Helper to normalize record lookup by date string
    const recordByDate = new Map(
      recentDailyCashRecords.map((record) => [dateKey(record.date), record])
    );

    const todayRecord = recordByDate.get(today.getTime());

    const todayCash = {
      totalIn: todayRecord?.totalIn || 0,
      totalOut: todayRecord?.totalOut || 0,
      totalLeft: todayRecord?.totalLeft || 0,
    };

    const monthlyRecords = recentDailyCashRecords.filter(
      (record) => record.date >= currentMonthStart
    );

    const monthlyTotals = monthlyRecords.reduce(
      (acc, record) => {
        acc.totalIn += record.totalIn || 0;
        acc.totalOut += record.totalOut || 0;
        acc.totalLeft += record.totalLeft || 0;
        return acc;
      },
      { totalIn: 0, totalOut: 0, totalLeft: 0 }
    );

    const monthlySeries = [];
    for (let i = 0; i < 30; i++) {
      const day = normalizeToUTCStart(subDays(today, 29 - i));
      const inRangeRecord = recordByDate.get(day.getTime());
      monthlySeries.push({
        dateLabel: day.toISOString(),
        totalIn: inRangeRecord?.totalIn || 0,
        totalOut: inRangeRecord?.totalOut || 0,
        totalLeft: inRangeRecord?.totalLeft || 0,
      });
    }

    // Build activities from recent data
    const activities: RecentActivity[] = [];

    // Add customer creation activities
    recentCustomers.forEach((customer) => {
      const customerId = customer._id.toString();
      activities.push({
        id: `customer_${customerId}`,
        type: 'customer_created',
        entityName: customer.name,
        description: `Customer "${customer.name}" was created`,
        entityType: 'customer',
        entityId: customerId,
        date: customer.createdAt,
        createdAt: customer.createdAt,
      });
    });

    // Add supplier creation activities
    recentSuppliers.forEach((supplier) => {
      const supplierId = supplier._id.toString();
      activities.push({
        id: `supplier_${supplierId}`,
        type: 'supplier_created',
        entityName: supplier.name,
        description: `Supplier "${supplier.name}" was created`,
        entityType: 'supplier',
        entityId: supplierId,
        date: supplier.createdAt,
        createdAt: supplier.createdAt,
      });
    });

    // Add transaction activities - use recent customers/suppliers for entity names
    const recentTransactions = transactions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    // Create lookup maps for efficient entity name resolution
    const customerMap = new Map(
      recentCustomers.map((c) => [c._id.toString(), c.name])
    );
    const supplierMap = new Map(
      recentSuppliers.map((s) => [s._id.toString(), s.name])
    );

    // If entity not in recent list, fetch it individually (only for transactions)
    for (const transaction of recentTransactions) {
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      let entityName = '';
      if (entityType === 'customer') {
        entityName = customerMap.get(entityId) || 
          customers.find((c) => c._id.toString() === entityId)?.name || 
          'Unknown Customer';
      } else {
        entityName = supplierMap.get(entityId) || 
          suppliers.find((s) => s._id.toString() === entityId)?.name || 
          'Unknown Supplier';
      }
      
      activities.push({
        id: transaction._id.toString(),
        type: 'transaction',
        entityName: entityName,
        description: transaction.description || `Transaction of ₹${transaction.amount}`,
        amount: transaction.amount,
        transactionType: transaction.type,
        entityType: entityType,
        entityId: entityId,
        date: transaction.date,
        createdAt: transaction.createdAt,
      });
    }

    // Sort all activities by createdAt descending
    activities.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Return top 20 activities
    const topActivities = activities.slice(0, 20);

    const aggregateTopEntities = (
      sourceTransactions: Transaction[],
      entityType: 'customer' | 'supplier'
    ) => {
      const totals = new Map<
        string,
        { total: number; credit: number; debit: number }
      >();

      sourceTransactions
        .filter((t) => t.entityType === entityType)
        .forEach((transaction) => {
          const entityId =
            transaction.entityId ||
            transaction.customerId ||
            transaction.supplierId;
          if (!entityId) return;

          if (!totals.has(entityId)) {
            totals.set(entityId, { total: 0, credit: 0, debit: 0 });
          }
          const entry = totals.get(entityId)!;
          entry.total += transaction.amount;
          if (transaction.type === 'credit') {
            entry.credit += transaction.amount;
          } else {
            entry.debit += transaction.amount;
          }
        });

      const nameSource =
        entityType === 'customer'
          ? customers
          : suppliers;

      return Array.from(totals.entries())
        .map(([entityId, summary]) => ({
          id: entityId,
          name:
            nameSource.find((entity) => entity._id.toString() === entityId)
              ?.name || 'Unknown',
          total: summary.total,
          credit: summary.credit,
          debit: summary.debit,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);
    };

    const topCustomers = aggregateTopEntities(transactions, 'customer');
    const topSuppliers = aggregateTopEntities(transactions, 'supplier');

    const responseData = {
      stats: {
        totalCredit,
        totalDebit,
        netBalance,
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        totalTransactions: transactions.length,
        todayCash,
        monthlyTotals,
        monthlySeries,
      },
      activities: topActivities,
      topCustomers,
      topSuppliers,
      dashboardNotes: dashboardNotes.map((note) => ({
        id: note._id.toString(),
        title: note.title,
        content: note.content || '',
        color: note.color,
        updatedAt: note.updatedAt,
      })),
    };

    // Cache the response with 45 second TTL
    try {
      const cacheKey = `dashboard:stats:${userId}`;
      await redis.setex(cacheKey, 45, JSON.stringify(responseData));
    } catch (cacheError) {
      // If Redis fails, continue without caching
      console.warn('Redis cache write failed:', cacheError);
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

