import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { bumpCacheVersions } from '@/lib/cache-version';
import { entitySearchTokens } from '@/lib/search-normalization';
import { refreshUserReadModels } from '@/lib/read-models';
import {
  cloudinaryAssetsFromFields,
  deleteCloudinaryAssets,
} from '@/lib/cloudinary-cleanup';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = await getDb();
    const customEntitiesCollection = db.collection('customEntities');

    const entity = await customEntitiesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      entity: {
        id: entity._id.toString(),
        collectionType: entity.collectionType,
        name: entity.name,
        phone: entity.phone,
        email: entity.email,
        address: entity.address,
        openingBalance: entity.openingBalance,
        balanceType: entity.balanceType,
        openingBalanceDescription: entity.openingBalanceDescription,
        openingBalanceBillUrl: entity.openingBalanceBillUrl,
        openingBalanceBillPublicId: entity.openingBalanceBillPublicId,
        createdAt: entity.createdAt,
      },
    });
  } catch (error) {
    console.error('Get custom entity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = customEntitySchema.parse(body);

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection('transactions');

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

    const existingEntity = await customEntitiesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!existingEntity) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    const result = await customEntitiesCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId,
      },
      {
        $set: {
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
          searchTokens: entitySearchTokens(validatedData),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    if (existingEntity.collectionType !== validatedData.collectionType) {
      await transactionsCollection.updateMany(
        { userId, entityId: id, entityType: existingEntity.collectionType },
        { $set: { entityType: validatedData.collectionType } }
      );
    }

    const keysToInvalidate = [
      `ledger:${validatedData.collectionType}:${id}:${userId}`
    ];
    if (existingEntity.collectionType !== validatedData.collectionType) {
      keysToInvalidate.push(
        `ledger:${existingEntity.collectionType}:${id}:${userId}`
      );
    }
    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['customEntities', 'dashboard', 'bootstrap', 'search']),
      redis.del(...keysToInvalidate),
    ]);

    return NextResponse.json({
      message: 'Entity updated successfully',
      entity: {
        id: id,
        ...validatedData,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Update custom entity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = await getDb();
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection('transactions');

    const entity = await customEntitiesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    const transactionDeleteFilter = {
      entityId: id,
      entityType: entity.collectionType,
      userId,
    };
    const transactionsToDelete = await transactionsCollection
      .find(transactionDeleteFilter, { projection: { billPublicId: 1, billUrl: 1 } })
      .toArray();
    const assetRefs = [
      ...cloudinaryAssetsFromFields({
        publicIds: [entity.openingBalanceBillPublicId],
        urls: [entity.openingBalanceBillUrl],
      }),
      ...transactionsToDelete.flatMap((transaction) =>
        cloudinaryAssetsFromFields({
          publicIds: [transaction.billPublicId],
          urls: [transaction.billUrl],
        })
      ),
    ];

    try {
      await deleteCloudinaryAssets(assetRefs);
    } catch (error) {
      console.error('Failed to delete custom entity assets:', error);
      return NextResponse.json(
        { error: 'Failed to delete associated uploaded files' },
        { status: 502 }
      );
    }

    await transactionsCollection.deleteMany(transactionDeleteFilter);

    const result = await customEntitiesCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['customEntities', 'dashboard', 'bootstrap', 'search']),
      redis.del(`ledger:${entity.collectionType}:${id}:${userId}`),
    ]);

    return NextResponse.json({
      message: 'Entity and all associated transactions deleted successfully',
    });
  } catch (error) {
    console.error('Delete custom entity error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
