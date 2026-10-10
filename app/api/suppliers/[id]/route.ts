import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';
import { bumpCacheVersions } from '@/lib/cache-version';
import { entitySearchFields } from '@/lib/search-normalization';
import { refreshUserReadModels } from '@/lib/read-models';
import { supplierSnapshot, supplierTermsFields, supplierTermsSchema } from '@/lib/supplier-payments';
import { supplierPaymentsEnabled } from '@/lib/supplier-payment-settings';
import { applyBusinessCashDelta, BusinessCashError, withBusinessCashTransaction } from '@/lib/business-cash';
import { supplierPaymentError } from '@/app/api/supplier-payments/shared';
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
  ...supplierTermsSchema.shape,
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
        ...supplierTermsFields(supplier),
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

    const changes = {
          name: validatedData.name,
          phone: validatedData.phone || '',
          email: validatedData.email || '',
          address: validatedData.address || '',
          openingBalance: validatedData.openingBalance,
          balanceType: validatedData.balanceType,
          openingBalanceDescription: validatedData.openingBalanceDescription || '',
          openingBalanceBillUrl: validatedData.openingBalanceBillUrl || '',
          openingBalanceBillPublicId: validatedData.openingBalanceBillPublicId || '',
          ...(validatedData.creditLimit !== undefined ? { creditLimit: validatedData.creditLimit } : {}),
          ...(validatedData.criticality !== undefined ? { criticality: validatedData.criticality } : {}),
          ...(validatedData.partialPaymentAllowed !== undefined ? { partialPaymentAllowed: validatedData.partialPaymentAllowed } : {}),
          ...entitySearchFields(validatedData),
        };
    const filter = { _id: new ObjectId(id), userId };
    const result = supplierPaymentsEnabled()
      ? await withBusinessCashTransaction(userId, async (transactionDb, session) => {
        const collection = transactionDb.collection('suppliers');
        const current = await collection.findOne(filter, { session });
        if (!current) return { matchedCount: 0, modifiedCount: 0 };
        const paymentPlanningChanged =
          Number(current.openingBalance || 0) !== validatedData.openingBalance
          || (current.balanceType ?? 'debit') !== validatedData.balanceType
          || (validatedData.creditLimit !== undefined && (current.creditLimit ?? null) !== validatedData.creditLimit)
          || (validatedData.criticality !== undefined && (current.criticality ?? 'normal') !== validatedData.criticality)
          || (validatedData.partialPaymentAllowed !== undefined && (current.partialPaymentAllowed ?? true) !== validatedData.partialPaymentAllowed);
        const updated = await collection.updateOne(
          filter,
          { $set: changes, ...(paymentPlanningChanged ? { $unset: { previousBalanceReservation: '' } } : {}) },
          { session },
        );
        if (updated.matchedCount && paymentPlanningChanged) {
          const snapshot = await supplierSnapshot(transactionDb, userId, session);
          if (snapshot.issues.length) throw new BusinessCashError(snapshot.issues[0]);
          await transactionDb.collection('transactions').updateMany({ userId, entityType: 'supplier', entityId: id, reservationStatus: 'active' }, { $set: { reservationStatus: 'cancelled', reservedAmount: 0 } }, { session });
          await applyBusinessCashDelta(transactionDb, userId, 0, session);
        }
        return updated;
      })
      : await suppliersCollection.updateOne(filter, { $set: changes });

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
    if (error instanceof BusinessCashError) return supplierPaymentError(error);
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
    if (supplierPaymentsEnabled()) {
      const removed = await withBusinessCashTransaction(userId, async (transactionDb, session) => {
        const current = await transactionDb.collection('suppliers').findOne({ _id: new ObjectId(id), userId }, { session });
        if (!current) throw new BusinessCashError('Supplier not found', 404);
        const hasTransactions = await transactionDb.collection('transactions').findOne(transactionDeleteFilter, { session });
        if (hasTransactions || current.previousBalanceReservation?.status === 'active') throw new BusinessCashError('Delete or reallocate this supplier’s transactions individually before removing the supplier. This preserves bill allocations and business cash.');
        await transactionDb.collection('suppliers').deleteOne({ _id: current._id, userId }, { session });
        // Serialize deletion with concurrent bill/payment creation for this user.
        await applyBusinessCashDelta(transactionDb, userId, 0, session);
        return current;
      });
      try { await deleteCloudinaryAssets(cloudinaryAssetsFromFields({ publicIds: [removed.openingBalanceBillPublicId], urls: [removed.openingBalanceBillUrl] })); }
      catch (error) { console.error('Supplier removed; attachment cleanup requires retry:', error); }
      await Promise.all([refreshUserReadModels(db, userId), bumpCacheVersions(userId, ['suppliers', 'dashboard', 'bootstrap', 'search']), redis.del(`ledger:supplier:${id}:${userId}`)]);
      return NextResponse.json({ message: 'Supplier deleted successfully' });
    }
    const transactionsToDelete = await transactionsCollection
      .find(transactionDeleteFilter, { projection: { billPublicId: 1, billUrl: 1, billStatus: 1, paymentAllocations: 1, businessCashApplied: 1, type: 1 } })
      .toArray();
    if (transactionsToDelete.some(tx => tx.billStatus !== undefined || tx.paymentAllocations !== undefined || tx.businessCashApplied) || supplier.previousBalanceReservation?.status === 'active') {
      return NextResponse.json({ error: 'Delete or reallocate this supplier’s transactions individually before removing the supplier. This preserves bill allocations and business cash.' }, { status: 409 });
    }
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
    if (error instanceof BusinessCashError) return supplierPaymentError(error);
    console.error('Delete supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
