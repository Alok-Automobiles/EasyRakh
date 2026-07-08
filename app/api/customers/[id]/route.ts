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

const customerSchema = z.object({
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
    const customersCollection = db.collection('customers');

    const customer = await customersCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      customer: {
        id: customer._id.toString(),
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        openingBalance: customer.openingBalance,
        balanceType: customer.balanceType,
        openingBalanceDescription: customer.openingBalanceDescription,
        openingBalanceBillUrl: customer.openingBalanceBillUrl,
        openingBalanceBillPublicId: customer.openingBalanceBillPublicId,
        createdAt: customer.createdAt,
      },
    });
  } catch (error) {
    console.error('Get customer error:', error);
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
    const validatedData = customerSchema.parse(body);

    const db = await getDb();
    const customersCollection = db.collection('customers');

    const result = await customersCollection.updateOne(
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
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['customers', 'dashboard', 'bootstrap', 'search']),
      redis.del(`ledger:customer:${id}:${userId}`),
    ]);

    return NextResponse.json({
      message: 'Customer updated successfully',
      customer: {
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

    console.error('Update customer error:', error);
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
    const customersCollection = db.collection('customers');
    const transactionsCollection = db.collection('transactions');
    const customer = await customersCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    const transactionDeleteFilter = {
      $or: [
        { customerId: id, userId },
        { entityId: id, entityType: 'customer', userId }
      ]
    };
    const transactionsToDelete = await transactionsCollection
      .find(transactionDeleteFilter, { projection: { billPublicId: 1, billUrl: 1 } })
      .toArray();
    const assetRefs = [
      ...cloudinaryAssetsFromFields({
        publicIds: [customer.openingBalanceBillPublicId],
        urls: [customer.openingBalanceBillUrl],
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
      console.error('Failed to delete customer assets:', error);
      return NextResponse.json(
        { error: 'Failed to delete associated uploaded files' },
        { status: 502 }
      );
    }

    await transactionsCollection.deleteMany(transactionDeleteFilter);

    const result = await customersCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['customers', 'dashboard', 'bootstrap', 'search']),
      redis.del(`ledger:customer:${id}:${userId}`),
    ]);

    return NextResponse.json({
      message: 'Customer and all associated transactions deleted successfully',
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
