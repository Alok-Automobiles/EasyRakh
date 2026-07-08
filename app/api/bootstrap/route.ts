import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getCachedJson, setCachedJson, versionedCacheKey } from '@/lib/cache-version';
import { ensureUserReadModels, type EntityBalance } from '@/lib/read-models';

const LAST_ACTIVE_WRITE_INTERVAL_MS = 15 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = await versionedCacheKey('bootstrap', userId);
    const cached = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const collectionTypesCollection = db.collection('collectionTypes');
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');
    await ensureUserReadModels(db, userId);

    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const lastActiveAt = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
    const now = new Date();
    const shouldUpdateLastActive =
      !lastActiveAt ||
      !Number.isFinite(lastActiveAt.getTime()) ||
      now.getTime() - lastActiveAt.getTime() >= LAST_ACTIVE_WRITE_INTERVAL_MS;

    if (shouldUpdateLastActive) {
      usersCollection
        .updateOne({ _id: new ObjectId(userId) }, { $set: { lastActiveAt: now } })
        .catch((error) => console.warn('Failed to update lastActiveAt:', error));
    }

    const [collectionTypes, customBalances] = await Promise.all([
      collectionTypesCollection.find({ userId }).sort({ createdAt: -1 }).toArray(),
      entityBalancesCollection
        .find({ userId, entityType: { $nin: ['customer', 'supplier'] } })
        .project({ entityType: 1, lastTransactionDate: 1 })
        .toArray(),
    ]);

    const lastTransactionByType = new Map<string, Date>();
    for (const balance of customBalances) {
      if (!balance.lastTransactionDate) continue;
      const existing = lastTransactionByType.get(balance.entityType);
      if (!existing || balance.lastTransactionDate > existing) {
        lastTransactionByType.set(balance.entityType, balance.lastTransactionDate);
      }
    }

    const responseData = {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        isAdmin: isAdminEmail(user.email),
        firmTitle: user.firmTitle || '',
        gstNumber: user.gstNumber || '',
        firmPhone: user.firmPhone || '',
        firmEmail: user.firmEmail || '',
        firmAddress: user.firmAddress || '',
      },
      collectionTypes: collectionTypes
        .map((ct) => ({
          id: ct._id.toString(),
          name: ct.name,
          slug: ct.slug,
          createdAt: ct.createdAt,
          lastTransactionDate: lastTransactionByType.get(ct.slug),
        }))
        .sort((a, b) => {
          if (a.lastTransactionDate && b.lastTransactionDate) {
            return b.lastTransactionDate.getTime() - a.lastTransactionDate.getTime();
          }
          if (a.lastTransactionDate) return -1;
          if (b.lastTransactionDate) return 1;
          return 0;
        }),
    };

    await setCachedJson(cacheKey, 300, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Bootstrap error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

