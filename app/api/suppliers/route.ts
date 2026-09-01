import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import type { Document } from 'mongodb';
import { bumpCacheVersions, getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';
import { entitySearchFields } from '@/lib/search-normalization';
import { ensureUserReadModels, refreshUserReadModels, type EntityBalance } from '@/lib/read-models';
import {
  buildEntitySearchStage,
  searchScoreStages,
  withMongoSearchFallback,
} from '@/lib/mongodb-search';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInteger(value: string | null, fallback: number, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function serializeSupplier(supplier: Document, balance?: EntityBalance) {
  const id = supplier._id.toString();
  const openingBalance = Number(supplier.openingBalance || 0);
  const signedOpening = supplier.balanceType === 'credit' ? -openingBalance : openingBalance;

  return {
    id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    openingBalance,
    balanceType: supplier.balanceType,
    createdAt: supplier.createdAt,
    totalBalance: balance?.totalBalance ?? signedOpening,
  };
}

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
  openingBalanceDescription: z.string().optional(),
  openingBalanceBillUrl: z.union([z.string().url('Invalid bill URL'), z.literal('')]).optional(),
  openingBalanceBillPublicId: z.string().optional(),
});

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
    const search = searchParams.get('search')?.trim().slice(0, 100) || '';
    const paginationRequested = searchParams.has('page') || searchParams.has('limit');
    const page = parsePositiveInteger(searchParams.get('page'), 1);
    const limit = parsePositiveInteger(searchParams.get('limit'), 20, 100);
    const skip = (page - 1) * limit;
    const cacheSuffix = paginationRequested
      ? `directory:${search.toLowerCase()}:page:${page}:limit:${limit}`
      : search.toLowerCase();
    const cacheKey = await requestCacheKey(request, 'suppliers', userId, cacheSuffix);
    const cached = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');
    await ensureUserReadModels(db, userId);

    if (paginationRequested) {
      const directoryFilter = { userId };
      const directoryTotalPromise = suppliersCollection.countDocuments(directoryFilter);
      const balanceSummaryPromise = entityBalancesCollection
        .aggregate<{ receivable: number; payable: number }>([
          { $match: { userId, entityType: 'supplier' } },
          {
            $group: {
              _id: null,
              receivable: {
                $sum: {
                  $cond: [{ $gt: ['$totalBalance', 0] }, '$totalBalance', 0],
                },
              },
              payable: {
                $sum: {
                  $cond: [{ $lt: ['$totalBalance', 0] }, { $abs: '$totalBalance' }, 0],
                },
              },
            },
          },
          { $project: { _id: 0, receivable: 1, payable: 1 } },
        ])
        .toArray();

      const runRegexQuery = async () => {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        const filter = {
          userId,
          $or: [{ name: regex }, { phone: regex }, { email: regex }, { address: regex }],
        };
        const [total, suppliers] = await Promise.all([
          suppliersCollection.countDocuments(filter),
          suppliersCollection
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);
        return { total, suppliers };
      };

      const directoryPagePromise = search
        ? search.length >= 2
          ? withMongoSearchFallback(
              'supplier directory',
              async () => {
                const [result] = await suppliersCollection
                  .aggregate<{ suppliers: Document[]; total: Array<{ count: number }> }>([
                    buildEntitySearchStage(userId, search),
                    ...searchScoreStages(),
                    { $sort: { _searchScore: -1, updatedAt: -1, createdAt: -1, _id: -1 } },
                    {
                      $facet: {
                        suppliers: [{ $skip: skip }, { $limit: limit }],
                        total: [{ $count: 'count' }],
                      },
                    },
                  ])
                  .toArray();
                return {
                  total: result?.total[0]?.count || 0,
                  suppliers: result?.suppliers || [],
                };
              },
              runRegexQuery,
              'suppliers'
            )
          : runRegexQuery()
        : Promise.all([
            directoryTotalPromise,
            suppliersCollection
              .find(directoryFilter)
              .sort({ createdAt: -1, _id: -1 })
              .skip(skip)
              .limit(limit)
              .toArray(),
          ]).then(([total, suppliers]) => ({ total, suppliers }));

      const [{ total, suppliers }, directoryTotal, balanceSummaryRows] = await Promise.all([
        directoryPagePromise,
        directoryTotalPromise,
        balanceSummaryPromise,
      ]);
      const supplierIds = suppliers.map((supplier) => supplier._id.toString());
      const balances = supplierIds.length > 0
        ? await entityBalancesCollection
            .find({ userId, entityType: 'supplier', entityId: { $in: supplierIds } })
            .toArray()
        : [];
      const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
      const balanceSummary = balanceSummaryRows[0] || { receivable: 0, payable: 0 };
      const responseData = {
        suppliers: suppliers.map((supplier) =>
          serializeSupplier(supplier, balanceMap.get(supplier._id.toString()))
        ),
        pagination: {
          total,
          page,
          pageSize: limit,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
        summary: {
          total: directoryTotal,
          receivable: balanceSummary.receivable || 0,
          payable: balanceSummary.payable || 0,
        },
      };

      await setCachedJson(cacheKey, 600, responseData);
      return NextResponse.json(responseData);
    }

    const suppliersPromise = search.length >= 2
      ? withMongoSearchFallback(
          'supplier directory',
          () => suppliersCollection
            .aggregate([
              buildEntitySearchStage(userId, search),
              ...searchScoreStages(),
              { $limit: 100 },
            ])
            .toArray(),
          () => {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            return suppliersCollection
              .find({ userId, $or: [{ name: regex }, { phone: regex }, { email: regex }, { address: regex }] })
              .sort({ createdAt: -1, _id: -1 })
              .limit(100)
              .toArray();
          },
          'suppliers'
        )
      : suppliersCollection.find({ userId }).sort({ createdAt: -1, _id: -1 }).toArray();

    const [suppliers, balances] = await Promise.all([
      suppliersPromise,
      entityBalancesCollection.find({ userId, entityType: 'supplier' }).toArray(),
    ]);

    const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
    const suppliersWithBalance = suppliers.map((supplier) =>
      serializeSupplier(supplier, balanceMap.get(supplier._id.toString()))
    );

    const responseData = {
      suppliers: suppliersWithBalance,
    };

    await setCachedJson(cacheKey, 600, responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get suppliers error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = supplierSchema.parse(body);

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');

    const result = await suppliersCollection.insertOne({
      userId,
      name: validatedData.name,
      phone: validatedData.phone || '',
      email: validatedData.email || '',
      address: validatedData.address || '',
      openingBalance: validatedData.openingBalance,
      balanceType: validatedData.balanceType,
      openingBalanceDescription: validatedData.openingBalanceDescription || '',
      openingBalanceBillUrl: validatedData.openingBalanceBillUrl || '',
      openingBalanceBillPublicId: validatedData.openingBalanceBillPublicId || '',
      ...entitySearchFields(validatedData),
      createdAt: new Date(),
    });

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['suppliers', 'dashboard', 'bootstrap', 'search']),
    ]);

    return NextResponse.json(
      {
        message: 'Supplier created successfully',
        supplier: {
          id: result.insertedId.toString(),
          ...validatedData,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Create supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
