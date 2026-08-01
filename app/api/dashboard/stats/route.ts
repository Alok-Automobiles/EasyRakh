import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { format } from 'date-fns';
import type { RecentActivity, Transaction } from '@/lib/types';
import { ObjectId } from 'mongodb';
import { ensureUserReadModels, type EntityBalance } from '@/lib/read-models';
import { getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';
import { calculateInvoiceTotals } from '@/lib/invoice-calculations';

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LOW_STOCK_THRESHOLD = 5;

function parseUtcCalendarDate(value: string) {
  if (!DATE_REGEX.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

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
      const fromDate = parseUtcCalendarDate(fromParam);
      const toDate = parseUtcCalendarDate(toParam);
      if (!fromDate || !toDate) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD for from and to.' },
          { status: 400 }
        );
      }
      rangeStart = fromDate;
      rangeEnd = new Date(Date.UTC(
        toDate.getUTCFullYear(),
        toDate.getUTCMonth(),
        toDate.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      if (rangeStart >= rangeEnd) {
        return NextResponse.json(
          { error: 'from must be before or equal to to.' },
          { status: 400 }
        );
      }
      periodLabel = `${format(rangeStart, 'd MMM yyyy')} – ${format(toDate, 'd MMM yyyy')}`;
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
    const invoicesCollection = db.collection('invoices');
    const notesCollection = db.collection('notes');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');

    const normalizeToUTCStart = (date: Date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const dateKey = (date: Date) => normalizeToUTCStart(date).getTime();

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 0, 0, 0, 0));
    const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodStart = rangeStart || currentMonthStart;
    const periodEnd = rangeEnd || tomorrow;
    const dailyCashQuery = hasDateFilter
      ? { userId, date: { $gte: rangeStart!, $lt: rangeEnd! } }
      : { userId, date: { $gte: currentMonthStart, $lt: tomorrow } };

    const [
      summary,
      topCustomerBalances,
      topSupplierBalances,
      recentTransactions,
      recentCustomers,
      recentSuppliers,
      recentDailyCashRecords,
      periodInvoices,
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
      invoicesCollection
        .find(
          {
            userId,
            $or: [
              { invoiceDate: { $gte: periodStart, $lt: periodEnd } },
              {
                invoiceDate: { $exists: false },
                createdAt: { $gte: periodStart, $lt: periodEnd },
              },
            ],
          },
          {
            projection: {
              totalAmount: 1,
              totalCogs: 1,
              costedSales: 1,
              uncostedSales: 1,
              missingCostItemCount: 1,
              grossProfit: 1,
              items: 1,
            },
          }
        )
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

    const salesProfit = periodInvoices.reduce(
      (acc, invoice) => {
        const calculated = calculateInvoiceTotals(invoice.items || []);
        const totalSales = Number(invoice.totalAmount ?? calculated.totalAmount ?? 0);
        const totalCogs = Number(invoice.totalCogs ?? calculated.totalCogs ?? 0);
        const costedSales = Number(invoice.costedSales ?? calculated.costedSales ?? 0);
        const uncostedSales = Number(invoice.uncostedSales ?? calculated.uncostedSales ?? 0);
        acc.totalSales += totalSales;
        acc.totalCogs += totalCogs;
        acc.costedSales += costedSales;
        acc.uncostedSales += uncostedSales;
        acc.missingCostItemCount += Number(
          invoice.missingCostItemCount ?? calculated.missingCostItemCount ?? 0
        );
        return acc;
      },
      {
        totalSales: 0,
        totalCogs: 0,
        costedSales: 0,
        uncostedSales: 0,
        missingCostItemCount: 0,
        grossProfit: 0,
        grossMargin: 0,
      }
    );
    salesProfit.totalSales = Math.round(salesProfit.totalSales * 100) / 100;
    salesProfit.totalCogs = Math.round(salesProfit.totalCogs * 100) / 100;
    salesProfit.costedSales = Math.round(salesProfit.costedSales * 100) / 100;
    salesProfit.uncostedSales = Math.round(salesProfit.uncostedSales * 100) / 100;
    salesProfit.grossProfit = Math.round((salesProfit.costedSales - salesProfit.totalCogs) * 100) / 100;
    salesProfit.grossMargin = salesProfit.costedSales > 0
      ? Math.round((salesProfit.grossProfit / salesProfit.costedSales) * 10000) / 100
      : 0;

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
      const currentMonthDayCount = today.getUTCDate();
      for (let i = 0; i < currentMonthDayCount; i++) {
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), i + 1));
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
        salesProfit,
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
