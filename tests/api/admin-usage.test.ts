import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

describe('/api/admin/usage', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    process.env.ADMIN_EMAILS = 'admin@example.com';
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/admin/usage/route');
    const response = await GET(jsonRequest('http://localhost/api/admin/usage'));

    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects authenticated non-admin users', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    const countDocuments = vi.fn();
    const findOne = vi.fn().mockResolvedValue({ email: 'owner@example.com' });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, countDocuments })),
    });

    const { GET } = await import('@/app/api/admin/usage/route');
    const response = await GET(jsonRequest('http://localhost/api/admin/usage'));

    expect(response.status).toBe(403);
    expect(findOne).toHaveBeenCalledWith(
      { _id: expect.any(Object) },
      { projection: { email: 1 } }
    );
    expect(countDocuments).not.toHaveBeenCalled();
  });

  it('returns usage metrics and normalized user rows for admins', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    const users = [
      {
        _id: objectIdLike(ids.user),
        name: 'Admin User',
        email: 'admin@example.com',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        lastLoginAt: new Date('2026-07-01T10:00:00.000Z'),
        lastActiveAt: new Date('2026-07-02T03:00:00.000Z'),
        loginCount: 5,
      },
      {
        _id: objectIdLike('507f1f77bcf86cd799439020'),
        name: 'Quiet User',
        email: 'quiet@example.com',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    ];
    const countDocuments = vi
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const findOne = vi.fn().mockResolvedValue({ email: 'admin@example.com' });
    const toArray = vi.fn().mockResolvedValue(users);
    const limit = vi.fn(() => ({ toArray }));
    const skip = vi.fn(() => ({ limit }));
    const sort = vi.fn(() => ({ skip }));
    const find = vi.fn(() => ({ sort }));
    const aggregateToArray = vi.fn().mockResolvedValue([{ totalLoginCount: 5 }]);
    const aggregate = vi.fn(() => ({ toArray: aggregateToArray }));
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, countDocuments, aggregate, find })),
    });

    const { GET } = await import('@/app/api/admin/usage/route');
    const response = await GET(jsonRequest('http://localhost/api/admin/usage'));

    expect(response.status).toBe(200);
    expect(countDocuments).toHaveBeenCalledTimes(7);
    expect(find).toHaveBeenCalledWith(
      {},
      {
        projection: {
          password: 0,
        },
      }
    );
    expect(aggregate).toHaveBeenCalledWith([
      {
        $group: {
          _id: null,
          totalLoginCount: { $sum: { $ifNull: ['$loginCount', 0] } },
        },
      },
    ]);
    expect(sort).toHaveBeenCalledWith({ lastActiveAt: -1, createdAt: -1 });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(10);
    await expect(response.json()).resolves.toMatchObject({
      totalUsers: 2,
      activeLast24Hours: 1,
      activeLast7Days: 1,
      activeLast30Days: 1,
      newUsersLast7Days: 0,
      inactive30PlusDays: 1,
      activeRateLast7Days: 50,
      activeRateLast30Days: 50,
      stickinessRate: 100,
      averageLoginCount: 2.5,
      pagination: {
        total: 2,
        totalUsers: 2,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      users: [
        {
          id: ids.user,
          name: 'Admin User',
          email: 'admin@example.com',
          createdAt: '2026-06-01T10:00:00.000Z',
          lastLoginAt: '2026-07-01T10:00:00.000Z',
          lastActiveAt: '2026-07-02T03:00:00.000Z',
          loginCount: 5,
        },
        {
          name: 'Quiet User',
          email: 'quiet@example.com',
          lastLoginAt: null,
          lastActiveAt: null,
          loginCount: 0,
        },
      ],
    });
  });

  it('paginates and filters admin user rows from query params', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    const users = [
      {
        _id: objectIdLike('507f1f77bcf86cd799439020'),
        name: 'Quiet User',
        email: 'quiet@example.com',
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
        lastLoginAt: null,
        lastActiveAt: null,
        loginCount: 0,
      },
    ];
    const countDocuments = vi
      .fn()
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(7);
    const findOne = vi.fn().mockResolvedValue({ email: 'admin@example.com' });
    const toArray = vi.fn().mockResolvedValue(users);
    const limit = vi.fn(() => ({ toArray }));
    const skip = vi.fn(() => ({ limit }));
    const sort = vi.fn(() => ({ skip }));
    const find = vi.fn(() => ({ sort }));
    const aggregate = vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([{ totalLoginCount: 30 }]),
    }));
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, countDocuments, aggregate, find })),
    });

    const { GET } = await import('@/app/api/admin/usage/route');
    const response = await GET(
      jsonRequest('http://localhost/api/admin/usage?search=quiet&status=inactive&page=2&limit=5')
    );

    const findCalls = find.mock.calls as unknown[][];
    const countDocumentCalls = countDocuments.mock.calls as unknown[][];
    const filter = findCalls[0]?.[0] as {
      $and: Array<{
        $or: Array<{
          name?: RegExp;
          lastActiveAt?: unknown;
        }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(countDocuments).toHaveBeenCalledTimes(7);
    expect(countDocumentCalls[6]?.[0]).toBe(filter);
    expect(filter.$and).toHaveLength(2);
    const searchRegex = filter.$and[0]?.$or[0]?.name;
    expect(searchRegex).toBeInstanceOf(RegExp);
    expect(searchRegex?.test('Quiet User')).toBe(true);
    expect(filter.$and[1]?.$or).toEqual(
      expect.arrayContaining([
        { lastActiveAt: { $exists: false } },
        { lastActiveAt: null },
      ])
    );
    expect(skip).toHaveBeenCalledWith(5);
    expect(limit).toHaveBeenCalledWith(5);
    await expect(response.json()).resolves.toMatchObject({
      totalUsers: 15,
      averageLoginCount: 2,
      pagination: {
        total: 7,
        totalUsers: 15,
        page: 2,
        pageSize: 5,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
      users: [
        {
          name: 'Quiet User',
          email: 'quiet@example.com',
          lastLoginAt: null,
          lastActiveAt: null,
          loginCount: 0,
        },
      ],
    });
  });
});
