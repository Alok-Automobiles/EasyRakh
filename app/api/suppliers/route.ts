import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
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

    const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 100) || '';
    const cacheKey = await requestCacheKey(request, 'suppliers', userId, search.toLowerCase());
    const cached = await getCachedJson<{ suppliers: unknown[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');
    await ensureUserReadModels(db, userId);

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
              .sort({ createdAt: -1 })
              .limit(100)
              .toArray();
          },
          'suppliers'
        )
      : suppliersCollection.find({ userId }).sort({ createdAt: -1 }).toArray();

    const [suppliers, balances] = await Promise.all([
      suppliersPromise,
      entityBalancesCollection.find({ userId, entityType: 'supplier' }).toArray(),
    ]);

    const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
    const suppliersWithBalance = suppliers.map((supplier) => {
      const id = supplier._id.toString();
      const balance = balanceMap.get(id);
      const openingBalance = supplier.openingBalance || 0;
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
    });

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
