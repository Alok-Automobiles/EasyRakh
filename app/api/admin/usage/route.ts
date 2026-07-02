import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoStringOrNull(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const requester = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { email: 1 } }
    );

    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(requester.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const last24Hours = new Date(now.getTime() - DAY_MS);
    const last7Days = new Date(now.getTime() - 7 * DAY_MS);
    const last30Days = new Date(now.getTime() - 30 * DAY_MS);

    const [
      totalUsers,
      activeLast24Hours,
      activeLast7Days,
      activeLast30Days,
      newUsersLast7Days,
      inactive30PlusDays,
      users,
    ] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ lastActiveAt: { $gte: last24Hours } }),
      usersCollection.countDocuments({ lastActiveAt: { $gte: last7Days } }),
      usersCollection.countDocuments({ lastActiveAt: { $gte: last30Days } }),
      usersCollection.countDocuments({ createdAt: { $gte: last7Days } }),
      usersCollection.countDocuments({
        $or: [
          { lastActiveAt: { $lt: last30Days } },
          { lastActiveAt: { $exists: false } },
          { lastActiveAt: null },
        ],
      }),
      usersCollection
        .find(
          {},
          {
            projection: {
              password: 0,
            },
          }
        )
        .sort({ lastActiveAt: -1, createdAt: -1 })
        .toArray(),
    ]);

    const totalLoginCount = users.reduce((sum, user) => sum + toNumber(user.loginCount), 0);
    const averageLoginCount = totalUsers > 0 ? Math.round((totalLoginCount / totalUsers) * 10) / 10 : 0;

    return NextResponse.json({
      totalUsers,
      activeLast24Hours,
      activeLast7Days,
      activeLast30Days,
      newUsersLast7Days,
      inactive30PlusDays,
      activeRateLast7Days: toPercent(activeLast7Days, totalUsers),
      activeRateLast30Days: toPercent(activeLast30Days, totalUsers),
      stickinessRate: toPercent(activeLast24Hours, activeLast30Days),
      averageLoginCount,
      generatedAt: now.toISOString(),
      users: users.map((user) => ({
        id: user._id.toString(),
        name: user.name || 'Unnamed user',
        email: user.email || '',
        createdAt: toIsoStringOrNull(user.createdAt),
        lastLoginAt: toIsoStringOrNull(user.lastLoginAt),
        lastActiveAt: toIsoStringOrNull(user.lastActiveAt),
        loginCount: toNumber(user.loginCount),
      })),
    });
  } catch (error) {
    console.error('Get admin usage error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
