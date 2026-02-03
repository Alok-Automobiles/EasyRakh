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

    const CACHE_TTL = 120;
    const STALE_TTL = 300;
    const cacheKey = `dashboard:stats:${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed.timestamp || 0);
        
        const response = NextResponse.json(parsed.data || parsed);
        
        if (age > CACHE_TTL * 1000 && age < STALE_TTL * 1000) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
          fetch(`${baseUrl}/api/dashboard/stats?bg=1`, {
            headers: request.headers
          }).catch(() => {});
        }
        
        return response;
      }
    } catch (cacheError) {
      console.warn('Redis cache read failed, falling back to DB:', cacheError);
    }

  const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection<Transaction>('transactions');
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');
    const notesCollection = db.collection('notes');

    const normalizeToUTCStart = (date: Date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const dateKey = (date: Date) => normalizeToUTCStart(date).getTime();

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 0, 0, 0, 0));
    const thirtyDaysAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0));
    const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));

    const recentTransactionsPreview = await transactionsCollection
      .find({ userId }, { projection: { entityType: 1, entityId: 1 } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const customEntityIds = new Set<string>();
    const customEntityTypeMap = new Map<string, string>();
    recentTransactionsPreview.forEach((tx) => {
      if (tx.entityType && tx.entityType !== 'customer' && tx.entityType !== 'supplier' && tx.entityId) {
        customEntityIds.add(tx.entityId.toString());
        customEntityTypeMap.set(tx.entityId.toString(), tx.entityType);
      }
    });

    const [
      transactionFacets,
      customerStats,
      supplierStats,
      recentCustomers,
      recentSuppliers,
      recentDailyCashRecords,
      dashboardNotes,
      customEntities,
    ] = await Promise.all([
      transactionsCollection
        .aggregate([
          { $match: { userId } },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    count: { $sum: 1 },
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
              ],
              topCustomers: [
                { $match: { entityType: 'customer' } },
                {
                  $group: {
                    _id: '$entityId',
                    total: { $sum: '$amount' },
                    credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
                    debit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
                  },
                },
                { $sort: { total: -1 } },
                { $limit: 3 },
                {
                  $lookup: {
                    from: 'customers',
                    let: { entityId: { $toObjectId: '$_id' } },
                    pipeline: [
                      { $match: { $expr: { $eq: ['$_id', '$$entityId'] } } },
                      { $project: { name: 1 } },
                    ],
                    as: 'entity',
                  },
                },
                { $unwind: { path: '$entity', preserveNullAndEmptyArrays: true } },
                {
                  $project: {
                    _id: 1,
                    total: 1,
                    credit: 1,
                    debit: 1,
                    name: { $ifNull: ['$entity.name', 'Unknown'] },
                  },
                },
              ],
              topSuppliers: [
                { $match: { entityType: 'supplier' } },
                {
                  $group: {
                    _id: '$entityId',
                    total: { $sum: '$amount' },
                    credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
                    debit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } },
                  },
                },
                { $sort: { total: -1 } },
                { $limit: 3 },
                {
                  $lookup: {
                    from: 'suppliers',
                    let: { entityId: { $toObjectId: '$_id' } },
                    pipeline: [
                      { $match: { $expr: { $eq: ['$_id', '$$entityId'] } } },
                      { $project: { name: 1 } },
                    ],
                    as: 'entity',
                  },
                },
                { $unwind: { path: '$entity', preserveNullAndEmptyArrays: true } },
                {
                  $project: {
                    _id: 1,
                    total: 1,
                    credit: 1,
                    debit: 1,
                    name: { $ifNull: ['$entity.name', 'Unknown'] },
                  },
                },
              ],
              recent: [
                { $sort: { createdAt: -1 } },
                { $limit: 20 },
                {
                  $project: {
                    _id: 1,
                    entityId: 1,
                    entityType: 1,
                    customerId: 1,
                    supplierId: 1,
                    amount: 1,
                    type: 1,
                    description: 1,
                    date: 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
        ])
        .toArray(),
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
      customersCollection
        .find({ userId }, { projection: { _id: 1, name: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      suppliersCollection
        .find({ userId }, { projection: { _id: 1, name: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      dailyCashRecordsCollection
        .find(
          { userId, date: { $gte: thirtyDaysAgo, $lt: tomorrow } },
          { projection: { date: 1, totalIn: 1, totalOut: 1, totalLeft: 1 } }
        )
        .sort({ date: 1 })
        .toArray(),
      notesCollection
        .find(
          { userId, showOnDashboard: true },
          { projection: { _id: 1, title: 1, content: 1, color: 1, updatedAt: 1 } }
        )
        .sort({ updatedAt: -1 })
        .limit(6)
        .toArray(),
      customEntityIds.size > 0
        ? customEntitiesCollection
            .find({
              userId,
              _id: { $in: Array.from(customEntityIds).map((id) => new ObjectId(id)) },
            })
            .toArray()
        : Promise.resolve([]),
    ]);

    const facet = transactionFacets[0] || { totals: [], topCustomers: [], topSuppliers: [], recent: [] };

    const txStats = (facet.totals && facet.totals[0]) || { totalCredit: 0, totalDebit: 0, customerCredit: 0, customerDebit: 0, supplierCredit: 0, supplierDebit: 0, count: 0 };
    const totalCredit = txStats.totalCredit || 0;
    const totalDebit = txStats.totalDebit || 0;
    const transactionCount = txStats.count || 0;

    const custStats = customerStats[0] || { count: 0, creditBalance: 0 };
    const suppStats = supplierStats[0] || { count: 0, creditBalance: 0 };
    const totalCustomers = custStats.count || 0;
    const totalSuppliers = suppStats.count || 0;

    const netBalance =
      (custStats.creditBalance || 0) +
      (suppStats.creditBalance || 0) -
      (txStats.customerCredit || 0) +
      (txStats.customerDebit || 0) -
      (txStats.supplierCredit || 0) +
      (txStats.supplierDebit || 0);

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

    const activities: RecentActivity[] = [];

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

    const customerMap = new Map(
      recentCustomers.map((c) => [c._id.toString(), c.name])
    );
    const supplierMap = new Map(
      recentSuppliers.map((s) => [s._id.toString(), s.name])
    );

    const recentTransactions = (facet.recent as Transaction[]) || [];

    const customEntityMap = new Map(
      customEntities.map((e) => [e._id.toString(), e.name])
    );

    for (const transaction of recentTransactions) {
      const transactionId =
        (transaction._id && transaction._id.toString()) ||
        `${transaction.entityId || transaction.customerId || transaction.supplierId || 'tx'}_${transaction.date?.toString() || Date.now()}`;
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      let entityName = '';
      if (entityType === 'customer') {
        entityName = customerMap.get(entityId) || 'Unknown Customer';
      } else if (entityType === 'supplier') {
        entityName = supplierMap.get(entityId) || 'Unknown Supplier';
      } else {
        entityName = customEntityMap.get(entityId) || 'Unknown Entity';
      }
      
      activities.push({
        id: transactionId,
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

    activities.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    const topActivities = activities.slice(0, 20);

    const topCustomers = (facet.topCustomers as any[]).map((agg) => ({
      id: agg._id || '',
      name: agg.name || 'Unknown',
      total: agg.total || 0,
      credit: agg.credit || 0,
      debit: agg.debit || 0,
    }));

    const topSuppliers = (facet.topSuppliers as any[]).map((agg) => ({
      id: agg._id || '',
      name: agg.name || 'Unknown',
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

    try {
      const cacheKey = `dashboard:stats:${userId}`;
      await redis.setex(
        cacheKey,
        STALE_TTL,
        JSON.stringify({
          data: responseData,
          timestamp: Date.now()
        })
      );
    } catch (cacheError) {
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

