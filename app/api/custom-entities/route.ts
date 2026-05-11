import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import redis from '@/lib/redis';

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

    if (!collectionType) {
      return NextResponse.json(
        { error: 'collectionType query parameter is required' },
        { status: 400 }
      );
    }

    try {
      const cacheKey = `customEntities:${collectionType}:${userId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (cacheError) {
      console.warn('Redis cache read failed, falling back to DB:', cacheError);
    }

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');
    const customEntitiesCollection = db.collection('customEntities');

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

    const entities = await customEntitiesCollection
      .find({ userId, collectionType })
      .sort({ createdAt: -1 })
      .toArray();

    const transactionsCollection = db.collection('transactions');

    const entitiesWithBalance = await Promise.all(
      entities.map(async (entity) => {
        const entityId = entity._id.toString();
        
        const transactions = await transactionsCollection
          .find({
            entityId: entityId,
            entityType: collectionType,
            userId,
          })
          .toArray();

        const totalCredit = transactions
          .filter((t) => t.type === 'credit')
          .reduce((sum, t) => sum + t.amount, 0);
        const totalDebit = transactions
          .filter((t) => t.type === 'debit')
          .reduce((sum, t) => sum + t.amount, 0);

        let totalBalance = entity.openingBalance;
        if (entity.balanceType === 'credit') {
          totalBalance = -totalBalance;
        }
        totalBalance = totalBalance - totalCredit + totalDebit;

        return {
          id: entityId,
          collectionType: entity.collectionType,
          name: entity.name,
          phone: entity.phone,
          email: entity.email,
          address: entity.address,
          openingBalance: entity.openingBalance,
          balanceType: entity.balanceType,
          totalBalance,
          createdAt: entity.createdAt,
        };
      })
    );

    const responseData = {
      entities: entitiesWithBalance,
    };

    try {
      const cacheKey = `customEntities:${collectionType}:${userId}`;
      await redis.setex(cacheKey, 600, JSON.stringify(responseData));
    } catch (cacheError) {
      console.warn('Redis cache write failed:', cacheError);
    }

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
      createdAt: new Date(),
    });

    redis.del(
      `customEntities:${validatedData.collectionType}:${userId}`,
      `dashboard:stats:${userId}`
    ).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

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

