import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { subDays } from 'date-fns';
import type { RecentActivity, Transaction } from '@/lib/types';
import redis from '@/lib/redis';
import { ObjectId } from 'mongodb';

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

    // Use aggregation pipelines for efficient calculations
    const [
      // Transaction totals using aggregation (much faster than loading all)
      transactionStats,
      // Transaction count
      transactionCount,
      // Customer and supplier counts and opening balance totals
      customerStats,
      supplierStats,
      // Recent data for activities (limited)
      recentCustomers,
      recentSuppliers,
      recentTransactions,
      recentDailyCashRecords,
      dashboardNotes,
    ] = await Promise.all([
      // Calculate transaction totals using aggregation
      transactionsCollection
        .aggregate([
          { $match: { userId } },
          {
            $group: {
              _id: null,
              totalCredit: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0],
                },
              },
              totalDebit: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0],
                },
              },
              customerCredit: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$entityType', 'customer'] }, { $eq: ['$type', 'credit'] }] },
                    '$amount',
                    0,
                  ],
                },
              },
              customerDebit: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$entityType', 'customer'] }, { $eq: ['$type', 'debit'] }] },
                    '$amount',
                    0,
                  ],
                },
              },
              supplierCredit: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$entityType', 'supplier'] }, { $eq: ['$type', 'credit'] }] },
                    '$amount',
                    0,
                  ],
                },
              },
              supplierDebit: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$entityType', 'supplier'] }, { $eq: ['$type', 'debit'] }] },
                    '$amount',
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),
      // Get transaction count
      transactionsCollection.countDocuments({ userId }),
      // Customer stats using aggregation
      customersCollection
        .aggregate([
          { $match: { userId } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              creditBalance: {
                $sum: {
                  $cond: [{ $eq: ['$balanceType', 'credit'] }, { $multiply: ['$openingBalance', -1] }, '$openingBalance'],
                },
              },
            },
          },
        ])
        .toArray(),
      // Supplier stats using aggregation
      suppliersCollection
        .aggregate([
          { $match: { userId } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              creditBalance: {
                $sum: {
                  $cond: [{ $eq: ['$balanceType', 'credit'] }, { $multiply: ['$openingBalance', -1] }, '$openingBalance'],
                },
              },
            },
          },
        ])
        .toArray(),
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
      // Recent transactions for activities (limit 20)
      transactionsCollection
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

    // Extract stats from aggregation results
    const txStats = transactionStats[0] || { totalCredit: 0, totalDebit: 0, customerCredit: 0, customerDebit: 0, supplierCredit: 0, supplierDebit: 0 };
    const totalCredit = txStats.totalCredit || 0;
    const totalDebit = txStats.totalDebit || 0;

    const custStats = customerStats[0] || { count: 0, creditBalance: 0 };
    const suppStats = supplierStats[0] || { count: 0, creditBalance: 0 };
    const totalCustomers = custStats.count || 0;
    const totalSuppliers = suppStats.count || 0;

    // Calculate net balance: opening balances + transactions
    // Customer transactions: Credit subtracts, Debit adds
    // Supplier transactions: Credit subtracts, Debit adds
    const netBalance =
      (custStats.creditBalance || 0) +
      (suppStats.creditBalance || 0) -
      (txStats.customerCredit || 0) +
      (txStats.customerDebit || 0) -
      (txStats.supplierCredit || 0) +
      (txStats.supplierDebit || 0);

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

    // Create lookup maps for efficient entity name resolution
    const customerMap = new Map(
      recentCustomers.map((c) => [c._id.toString(), c.name])
    );
    const supplierMap = new Map(
      recentSuppliers.map((s) => [s._id.toString(), s.name])
    );

    // Add transaction activities from recent transactions (already limited to 20)
    for (const transaction of recentTransactions) {
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      let entityName = '';
      if (entityType === 'customer') {
        entityName = customerMap.get(entityId) || 'Unknown Customer';
      } else {
        entityName = supplierMap.get(entityId) || 'Unknown Supplier';
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

    // Use aggregation for top customers and suppliers (much more efficient)
    const [topCustomersAgg, topSuppliersAgg] = await Promise.all([
      transactionsCollection
        .aggregate([
          { $match: { userId, entityType: 'customer' } },
          {
            $group: {
              _id: '$entityId',
              total: { $sum: '$amount' },
              credit: {
                $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
              },
              debit: {
                $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
              },
            },
          },
          { $sort: { total: -1 } },
          { $limit: 3 },
        ])
        .toArray(),
      transactionsCollection
        .aggregate([
          { $match: { userId, entityType: 'supplier' } },
          {
            $group: {
              _id: '$entityId',
              total: { $sum: '$amount' },
              credit: {
                $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
              },
              debit: {
                $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
              },
            },
          },
          { $sort: { total: -1 } },
          { $limit: 3 },
        ])
        .toArray(),
    ]);

    // Fetch entity names for top customers and suppliers
    const topCustomerIds = topCustomersAgg.map((t) => t._id).filter(Boolean);
    const topSupplierIds = topSuppliersAgg.map((t) => t._id).filter(Boolean);

    const [topCustomerEntities, topSupplierEntities] = await Promise.all([
      topCustomerIds.length > 0
        ? customersCollection
            .find({ userId, _id: { $in: topCustomerIds.map((id) => new ObjectId(id)) } })
            .toArray()
        : [],
      topSupplierIds.length > 0
        ? suppliersCollection
            .find({ userId, _id: { $in: topSupplierIds.map((id) => new ObjectId(id)) } })
            .toArray()
        : [],
    ]);

    const customerNameMap = new Map(topCustomerEntities.map((c) => [c._id.toString(), c.name]));
    const supplierNameMap = new Map(topSupplierEntities.map((s) => [s._id.toString(), s.name]));

    const topCustomers = topCustomersAgg.map((agg) => ({
      id: agg._id || '',
      name: customerNameMap.get(agg._id || '') || 'Unknown',
      total: agg.total || 0,
      credit: agg.credit || 0,
      debit: agg.debit || 0,
    }));

    const topSuppliers = topSuppliersAgg.map((agg) => ({
      id: agg._id || '',
      name: supplierNameMap.get(agg._id || '') || 'Unknown',
      total: agg.total || 0,
      credit: agg.credit || 0,
      debit: agg.debit || 0,
    }));

    const responseData = {
      stats: {
        totalCredit,
        totalDebit,
        netBalance,
        totalCustomers,
        totalSuppliers,
        totalTransactions: transactionCount,
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

