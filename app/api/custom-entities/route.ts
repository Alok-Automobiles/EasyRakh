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

const customEntitySchema = z.object({
  collectionType: z.string().min(1, 'Collection type is required'),
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

    const { searchParams } = new URL(request.url);
    const collectionType = searchParams.get('collectionType');
    const search = searchParams.get('search')?.trim().slice(0, 100) || '';

    if (!collectionType) {
      return NextResponse.json(
        { error: 'collectionType query parameter is required' },
        { status: 400 }
      );
    }

    const cacheKey = await requestCacheKey(
      request,
      'customEntities',
      userId,
      `${collectionType}:${search.toLowerCase()}`
    );
    const cached = await getCachedJson<{ entities: unknown[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');
    const customEntitiesCollection = db.collection('customEntities');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');

    const collectionTypeDoc = await collectionTypesCollection.findOne({
      userId,
      slug: collectionType,
    });

    if (!collectionTypeDoc) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    await ensureUserReadModels(db, userId);

    const entitiesPromise = search.length >= 2
      ? withMongoSearchFallback(
          'custom entity directory',
          () => customEntitiesCollection
            .aggregate([
              buildEntitySearchStage(userId, search, collectionType),
              ...searchScoreStages(),
              { $limit: 100 },
            ])
            .toArray(),
          () => {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            return customEntitiesCollection
              .find({
                userId,
                collectionType,
                $or: [{ name: regex }, { phone: regex }, { email: regex }, { address: regex }],
              })
              .sort({ createdAt: -1 })
              .limit(100)
              .toArray();
          },
          'customEntities'
        )
      : customEntitiesCollection
          .find({ userId, collectionType })
          .sort({ createdAt: -1 })
          .toArray();

    const [entities, balances] = await Promise.all([
      entitiesPromise,
      entityBalancesCollection.find({ userId, entityType: collectionType }).toArray(),
    ]);

    const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
    const entitiesWithBalance = entities.map((entity) => {
      const id = entity._id.toString();
      const balance = balanceMap.get(id);
      const openingBalance = entity.openingBalance || 0;
      const signedOpening = entity.balanceType === 'credit' ? -openingBalance : openingBalance;

      return {
        id,
        collectionType: entity.collectionType,
        name: entity.name,
        phone: entity.phone,
        email: entity.email,
        address: entity.address,
        openingBalance,
        balanceType: entity.balanceType,
        totalBalance: balance?.totalBalance ?? signedOpening,
        createdAt: entity.createdAt,
      };
    });

    const responseData = {
      entities: entitiesWithBalance,
    };

    await setCachedJson(cacheKey, 600, responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get custom entities error:', error);
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
    const validatedData = customEntitySchema.parse(body);

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');
    const customEntitiesCollection = db.collection('customEntities');

    const collectionTypeDoc = await collectionTypesCollection.findOne({
      userId,
      slug: validatedData.collectionType,
    });

    if (!collectionTypeDoc) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    const result = await customEntitiesCollection.insertOne({
      userId,
      collectionType: validatedData.collectionType,
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
      bumpCacheVersions(userId, ['customEntities', 'dashboard', 'bootstrap', 'search']),
    ]);

    return NextResponse.json(
      {
        message: 'Entity created successfully',
        entity: {
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

    console.error('Create custom entity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
