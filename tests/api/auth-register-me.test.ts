import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  generateToken: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  getDb: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: mocks.hash,
  },
}));

vi.mock('@/lib/auth', () => ({
  generateToken: mocks.generateToken,
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitConfigs: {
    auth: { windowMs: 60_000, maxRequests: 5 },
  },
}));

describe('auth register and profile routes', () => {
  beforeEach(() => {
    mocks.hash.mockReset();
    mocks.generateToken.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.getDb.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.hash.mockResolvedValue('hashed-password');
    mocks.generateToken.mockReturnValue('signed-token');
  });

  it('registers users with lowercased emails, trimmed firm metadata, and an auth cookie', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const insertOne = vi.fn().mockResolvedValue({ insertedId: objectIdLike(ids.user) });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, insertOne })),
    });

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      jsonRequest('http://localhost/api/auth/register', {
        name: 'Shop Owner',
        email: 'OWNER@EXAMPLE.COM',
        password: 'secret123',
        firmTitle: '  EasyRakh Auto  ',
        gstNumber: '  22AAAAA0000A1Z5  ',
        firmPhone: '',
        firmEmail: '  billing@example.com  ',
        firmAddress: '  Main market  ',
      })
    );

    expect(response.status).toBe(201);
    expect(findOne).toHaveBeenCalledWith({ email: 'owner@example.com' });
    expect(mocks.hash).toHaveBeenCalledWith('secret123', 10);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Shop Owner',
        email: 'owner@example.com',
        password: 'hashed-password',
        firmTitle: 'EasyRakh Auto',
        gstNumber: '22AAAAA0000A1Z5',
        firmEmail: 'billing@example.com',
        firmAddress: 'Main market',
        createdAt: expect.any(Date),
      })
    );
    expect(insertOne.mock.calls[0][0]).not.toHaveProperty('firmPhone');
    expect(response.headers.get('set-cookie')).toContain('token=signed-token');
    await expect(response.json()).resolves.toMatchObject({
      token: 'signed-token',
      user: {
        id: ids.user,
        email: 'owner@example.com',
        firmTitle: 'EasyRakh Auto',
      },
    });
  });

  it('does not hash or insert when registration is rate limited', async () => {
    mocks.checkRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      jsonRequest('http://localhost/api/auth/register', {
        name: 'Shop Owner',
        email: 'owner@example.com',
        password: 'secret123',
      })
    );

    expect(response.status).toBe(429);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });

  it('updates profile fields with trimmed values and never returns the password', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const findOne = vi.fn().mockResolvedValue({
      _id: objectIdLike(ids.user),
      name: 'Updated Owner',
      email: 'owner@example.com',
      firmTitle: 'Updated Firm',
      gstNumber: '',
      firmPhone: '9999999999',
      firmEmail: '',
      firmAddress: 'Updated address',
      password: 'should-not-be-projected',
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ updateOne, findOne })),
    });

    const { PUT } = await import('@/app/api/auth/me/route');
    const response = await PUT(
      jsonRequest('http://localhost/api/auth/me', {
        name: 'Updated Owner',
        firmTitle: '  Updated Firm  ',
        gstNumber: '   ',
        firmPhone: '  9999999999  ',
        firmEmail: '',
        firmAddress: '  Updated address  ',
      }, { method: 'PUT' })
    );

    expect(response.status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Object) },
      {
        $set: expect.objectContaining({
          name: 'Updated Owner',
          firmTitle: 'Updated Firm',
          gstNumber: '',
          firmPhone: '9999999999',
          firmEmail: '',
          firmAddress: 'Updated address',
          updatedAt: expect.any(Date),
        }),
      }
    );
    const body = await response.json();
    expect(body.user).toMatchObject({
      id: ids.user,
      name: 'Updated Owner',
      email: 'owner@example.com',
      firmTitle: 'Updated Firm',
    });
    expect(body.user).not.toHaveProperty('password');
  });
});
