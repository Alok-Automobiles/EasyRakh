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
    const suppliersCollection = db.collection('suppliers');

    const supplier = await suppliersCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      supplier: {
        id: supplier._id.toString(),
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        openingBalance: supplier.openingBalance,
        balanceType: supplier.balanceType,
        openingBalanceDescription: supplier.openingBalanceDescription,
        openingBalanceBillUrl: supplier.openingBalanceBillUrl,
        openingBalanceBillPublicId: supplier.openingBalanceBillPublicId,
        createdAt: supplier.createdAt,
      },
    });
  } catch (error) {
    console.error('Get supplier error:', error);
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
    const validatedData = supplierSchema.parse(body);

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');

    const result = await suppliersCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId,
      },
      {
        $set: {
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
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['suppliers', 'dashboard', 'bootstrap', 'search']),
      redis.del(`ledger:supplier:${id}:${userId}`),
    ]);

    return NextResponse.json({
      message: 'Supplier updated successfully',
      supplier: {
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

    console.error('Update supplier error:', error);
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
    const suppliersCollection = db.collection('suppliers');
    const transactionsCollection = db.collection('transactions');
    const supplier = await suppliersCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    const transactionDeleteFilter = {
      $or: [
        { supplierId: id, userId },
        { entityId: id, entityType: 'supplier', userId }
      ]
    };
    const transactionsToDelete = await transactionsCollection
      .find(transactionDeleteFilter, { projection: { billPublicId: 1, billUrl: 1 } })
      .toArray();
    const assetRefs = [
      ...cloudinaryAssetsFromFields({
        publicIds: [supplier.openingBalanceBillPublicId],
        urls: [supplier.openingBalanceBillUrl],
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
      console.error('Failed to delete supplier assets:', error);
      return NextResponse.json(
        { error: 'Failed to delete associated uploaded files' },
        { status: 502 }
      );
    }

    await transactionsCollection.deleteMany(transactionDeleteFilter);

    const result = await suppliersCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['suppliers', 'dashboard', 'bootstrap', 'search']),
      redis.del(`ledger:supplier:${id}:${userId}`),
    ]);

    return NextResponse.json({
      message: 'Supplier and all associated transactions deleted successfully',
    });
  } catch (error) {
    console.error('Delete supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
