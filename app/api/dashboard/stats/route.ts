import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { subDays, format } from 'date-fns';
import type { RecentActivity, Transaction } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { ensureUserReadModels, type EntityBalance } from '@/lib/read-models';
import { getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LOW_STOCK_THRESHOLD = 5;

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const monthParam = searchParams.get('month');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    let periodLabel: string | undefined;

    if (monthParam) {
      if (!MONTH_REGEX.test(monthParam)) {
        return NextResponse.json(
          { error: 'Invalid month format. Use YYYY-MM.' },
          { status: 400 }
        );
      }
      const [y, m] = monthParam.split('-').map(Number);
      rangeStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
      rangeEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
      periodLabel = format(rangeStart, 'MMMM yyyy');
    } else if (fromParam && toParam) {
      if (!DATE_REGEX.test(fromParam) || !DATE_REGEX.test(toParam)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD for from and to.' },
          { status: 400 }
        );
      }
      const [fy, fm, fd] = fromParam.split('-').map(Number);
      const [ty, tm, td] = toParam.split('-').map(Number);
      rangeStart = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0));
      rangeEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 0, 0, 0, 0));
      if (rangeStart >= rangeEnd) {
        return NextResponse.json(
          { error: 'from must be before or equal to to.' },
          { status: 400 }
        );
      }
      periodLabel = `${format(rangeStart, 'd MMM yyyy')} – ${format(new Date(ty, tm - 1, td), 'd MMM yyyy')}`;
    }

    const hasDateFilter = rangeStart !== null && rangeEnd !== null;
    const cacheSuffix = hasDateFilter ? monthParam || `${fromParam}-${toParam}` : 'current';
    const cacheKey = await requestCacheKey(request, 'dashboard', userId, cacheSuffix);
    const cached = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection<Transaction>('transactions');
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');
    const notesCollection = db.collection('notes');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');

    const normalizeToUTCStart = (date: Date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const dateKey = (date: Date) => normalizeToUTCStart(date).getTime();

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 0, 0, 0, 0));
    const thirtyDaysAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0));
    const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const dailyCashQuery = hasDateFilter
      ? { userId, date: { $gte: rangeStart!, $lt: rangeEnd! } }
      : { userId, date: { $gte: thirtyDaysAgo, $lt: tomorrow } };

    const [
      summary,
      topCustomerBalances,
      topSupplierBalances,
      recentTransactions,
      recentCustomers,
      recentSuppliers,
      recentDailyCashRecords,
      dashboardNotes,
    ] = await Promise.all([
      ensureUserReadModels(db, userId),
      entityBalancesCollection
        .find({ userId, entityType: 'customer' })
        .sort({ totalDebit: -1, totalCredit: -1, lastTransactionDate: -1 })
        .limit(3)
        .toArray(),
      entityBalancesCollection
        .find({ userId, entityType: 'supplier' })
        .sort({ totalDebit: -1, totalCredit: -1, lastTransactionDate: -1 })
        .limit(3)
        .toArray(),
      transactionsCollection
        .find({ userId }, {
          projection: {
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
        })
        .sort({ createdAt: -1 })
        .limit(20)
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
        .find(dailyCashQuery, { projection: { date: 1, totalIn: 1, totalOut: 1, totalLeft: 1 } })
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
    ]);

    const totalCredit = summary.totalCredit || 0;
    const totalDebit = summary.totalDebit || 0;
    const transactionCount = summary.totalTransactions || 0;
    const totalCustomers = summary.totalCustomers || 0;
    const totalSuppliers = summary.totalSuppliers || 0;

    const netBalance =
      (summary.customerOpeningBalanceTotal || 0) +
      (summary.supplierOpeningBalanceTotal || 0) -
      (summary.customerCredit || 0) +
      (summary.customerDebit || 0) -
      (summary.supplierCredit || 0) +
      (summary.supplierDebit || 0);

    const recordByDate = new Map(
      recentDailyCashRecords.map((record) => [dateKey(record.date), record])
    );

    let todayRecord = recordByDate.get(today.getTime());
    if (hasDateFilter && !todayRecord) {
      const todayRecords = await dailyCashRecordsCollection
        .find(
          { userId, date: { $gte: today, $lt: tomorrow } },
          { projection: { date: 1, totalIn: 1, totalOut: 1, totalLeft: 1 } }
        )
        .limit(1)
        .toArray();
      todayRecord = todayRecords[0] ?? null;
    }

    const todayCash = {
      totalIn: todayRecord?.totalIn || 0,
      totalOut: todayRecord?.totalOut || 0,
      totalLeft: todayRecord?.totalLeft || 0,
    };

    let monthlyRecords: typeof recentDailyCashRecords;
    let monthlyTotals: { totalIn: number; totalOut: number; totalLeft: number };
    let monthlySeries: { dateLabel: string; totalIn: number; totalOut: number; totalLeft: number }[];

    if (hasDateFilter && rangeStart && rangeEnd) {
      monthlyRecords = recentDailyCashRecords;
      monthlyTotals = monthlyRecords.reduce(
        (acc, record) => {
          acc.totalIn += record.totalIn || 0;
          acc.totalOut += record.totalOut || 0;
          acc.totalLeft += record.totalLeft || 0;
          return acc;
        },
        { totalIn: 0, totalOut: 0, totalLeft: 0 }
      );
      const numDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));
      monthlySeries = [];
      for (let i = 0; i < numDays; i++) {
        const dayStart = new Date(Date.UTC(
          rangeStart.getUTCFullYear(),
          rangeStart.getUTCMonth(),
          rangeStart.getUTCDate() + i,
          0, 0, 0, 0
        ));
        const inRangeRecord = recordByDate.get(dayStart.getTime());
        monthlySeries.push({
          dateLabel: dayStart.toISOString(),
          totalIn: inRangeRecord?.totalIn || 0,
          totalOut: inRangeRecord?.totalOut || 0,
          totalLeft: inRangeRecord?.totalLeft || 0,
        });
      }
    } else {
      monthlyRecords = recentDailyCashRecords.filter(
        (record) => record.date >= currentMonthStart
      );
      monthlyTotals = monthlyRecords.reduce(
        (acc, record) => {
          acc.totalIn += record.totalIn || 0;
          acc.totalOut += record.totalOut || 0;
          acc.totalLeft += record.totalLeft || 0;
          return acc;
        },
        { totalIn: 0, totalOut: 0, totalLeft: 0 }
      );
      monthlySeries = [];
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

    const customEntityTransactions = recentTransactions.filter(
      (tx) => tx.entityType && tx.entityType !== 'customer' && tx.entityType !== 'supplier'
    );
    const customEntityIds = new Set<string>();
    const customEntityTypeMap = new Map<string, string>(); // entityId -> collectionType

    customEntityTransactions.forEach((tx) => {
      const entityId = tx.entityId || '';
      if (entityId && tx.entityType) {
        customEntityIds.add(entityId);
        customEntityTypeMap.set(entityId, tx.entityType);
      }
    });

    const customEntities = customEntityIds.size > 0
      ? await customEntitiesCollection
          .find({
            userId,
            _id: { $in: Array.from(customEntityIds).map((id) => new ObjectId(id)) },
          })
          .toArray()
      : [];

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

    const topCustomers = topCustomerBalances.map((balance) => ({
      id: balance.entityId || '',
      name: balance.entityName || 'Unknown',
      total: (balance.totalCredit || 0) + (balance.totalDebit || 0),
      credit: balance.totalCredit || 0,
      debit: balance.totalDebit || 0,
    }));

    const topSuppliers = topSupplierBalances.map((balance) => ({
      id: balance.entityId || '',
      name: balance.entityName || 'Unknown',
      total: (balance.totalCredit || 0) + (balance.totalDebit || 0),
      credit: balance.totalCredit || 0,
      debit: balance.totalDebit || 0,
    }));

    const inventorySummary = summary.inventory || {
      totalItems: 0,
      totalQuantity: 0,
      totalValue: 0,
      outOfStockItems: 0,
      inactiveItems: 0,
      restockItems: 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    };

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
        inventory: inventorySummary,
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
      ...(periodLabel && { periodLabel }),
    };

    await setCachedJson(cacheKey, 300, responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
