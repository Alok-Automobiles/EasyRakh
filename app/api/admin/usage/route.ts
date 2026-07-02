import { NextRequest, NextResponse } from 'next/server';
import { ObjectId, type Document, type Filter } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const ACTIVITY_FILTERS = ['all', '24h', '7d', '30d', 'inactive'] as const;

type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

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

function parsePositiveInteger(value: string | null, fallback: number, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function getActivityFilter(value: string | null): ActivityFilter {
  if (ACTIVITY_FILTERS.includes(value as ActivityFilter)) {
    return value as ActivityFilter;
  }

  return 'all';
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildStatusFilter(
  status: ActivityFilter,
  last24Hours: Date,
  last7Days: Date,
  last30Days: Date
): Filter<Document> | null {
  switch (status) {
    case '24h':
      return { lastActiveAt: { $gte: last24Hours } };
    case '7d':
      return { lastActiveAt: { $gte: last7Days } };
    case '30d':
      return { lastActiveAt: { $gte: last30Days } };
    case 'inactive':
      return {
        $or: [
          { lastActiveAt: { $lt: last30Days } },
          { lastActiveAt: { $exists: false } },
          { lastActiveAt: null },
        ],
      };
    default:
      return null;
  }
}

function buildUsersFilter({
  search,
  status,
  last24Hours,
  last7Days,
  last30Days,
}: {
  search: string;
  status: ActivityFilter;
  last24Hours: Date;
  last7Days: Date;
  last30Days: Date;
}): Filter<Document> {
  const filters: Filter<Document>[] = [];

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    filters.push({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
      ],
    });
  }

  const statusFilter = buildStatusFilter(status, last24Hours, last7Days, last30Days);
  if (statusFilter) {
    filters.push(statusFilter);
  }

  if (filters.length === 0) return {};
  if (filters.length === 1) return filters[0];

  return { $and: filters };
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
    const page = parsePositiveInteger(request.nextUrl.searchParams.get('page'), 1);
    const limit = parsePositiveInteger(
      request.nextUrl.searchParams.get('limit'),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );
    const search = (request.nextUrl.searchParams.get('search') || '').trim();
    const status = getActivityFilter(request.nextUrl.searchParams.get('status'));
    const usersFilter = buildUsersFilter({
      search,
      status,
      last24Hours,
      last7Days,
      last30Days,
    });

    const [
      totalUsers,
      activeLast24Hours,
      activeLast7Days,
      activeLast30Days,
      newUsersLast7Days,
      inactive30PlusDays,
      filteredUsers,
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
      usersCollection.countDocuments(usersFilter),
    ]);

    const totalPages = Math.max(1, Math.ceil(filteredUsers / limit));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * limit;

    const [loginStats, users] = await Promise.all([
      usersCollection.aggregate([
        {
          $group: {
            _id: null,
            totalLoginCount: { $sum: { $ifNull: ['$loginCount', 0] } },
          },
        },
      ]).toArray(),
      usersCollection
        .find(
          usersFilter,
          {
            projection: {
              password: 0,
            },
          }
        )
        .sort({ lastActiveAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    ]);

    const totalLoginCount = toNumber(loginStats[0]?.totalLoginCount);
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
      pagination: {
        total: filteredUsers,
        totalUsers,
        page: currentPage,
        pageSize: limit,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
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
