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
      .mockResolvedValueOnce(1);
    const findOne = vi.fn().mockResolvedValue({ email: 'admin@example.com' });
    const toArray = vi.fn().mockResolvedValue(users);
    const sort = vi.fn(() => ({ toArray }));
    const find = vi.fn(() => ({ sort }));
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, countDocuments, find })),
    });

    const { GET } = await import('@/app/api/admin/usage/route');
    const response = await GET(jsonRequest('http://localhost/api/admin/usage'));

    expect(response.status).toBe(200);
    expect(countDocuments).toHaveBeenCalledTimes(6);
    expect(find).toHaveBeenCalledWith(
      {},
      {
        projection: {
          password: 0,
        },
      }
    );
    expect(sort).toHaveBeenCalledWith({ lastActiveAt: -1, createdAt: -1 });
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
});
