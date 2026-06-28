import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  redisDel: vi.fn(),
  deleteAsset: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/redis', () => ({
  default: {
    del: mocks.redisDel,
  },
}));

vi.mock('@/lib/cloudinary', () => ({
  deleteAsset: mocks.deleteAsset,
}));

describe('/api/transactions/[id]', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisDel.mockReset();
    mocks.deleteAsset.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.redisDel.mockResolvedValue(1);
    mocks.deleteAsset.mockResolvedValue(undefined);
  });

  it('removes replaced bill assets and invalidates old and new entity ledgers when moving transactions', async () => {
    const existing = {
      _id: objectIdLike(ids.transaction),
      userId: ids.user,
      entityType: 'supplier',
      entityId: ids.supplier,
      billUrl: 'https://res.cloudinary.com/demo/image/upload/old.jpg',
      billPublicId: 'bills/old',
    };
    const transactionFindOne = vi
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const customerFindOne = vi.fn().mockResolvedValue({ _id: objectIdLike(ids.customer), userId: ids.user });
    const collection = vi.fn((name: string) => {
      if (name === 'transactions') return { findOne: transactionFindOne, updateOne };
      if (name === 'customers') return { findOne: customerFindOne };
      return { findOne: vi.fn().mockResolvedValue(null) };
    });
    mocks.getDb.mockResolvedValue({ collection });

    const { PUT } = await import('@/app/api/transactions/[id]/route');
    const response = await PUT(
      jsonRequest('http://localhost/api/transactions/tx', {
        entityType: 'customer',
        entityId: ids.customer,
        type: 'credit',
        amount: 900,
        description: 'Moved to customer ledger',
        date: '2026-06-22',
        billUrl: '',
        billPublicId: '',
      }, { method: 'PUT' }),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteAsset).toHaveBeenCalledWith('bills/old');
    expect(updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      expect.objectContaining({
        $set: expect.objectContaining({
          entityType: 'customer',
          entityId: ids.customer,
          customerId: ids.customer,
          supplierId: undefined,
          amount: 900,
        }),
        $unset: { billUrl: '', billPublicId: '' },
      })
    );
    expect(mocks.redisDel).toHaveBeenCalledWith(
      `dashboard:stats:${ids.user}`,
      `ledger:customer:${ids.customer}:${ids.user}`,
      `customers:${ids.user}`,
      `ledger:supplier:${ids.supplier}:${ids.user}`,
      `suppliers:${ids.user}`
    );
    const body = await response.json();
    expect(body.transaction).toMatchObject({ id: ids.transaction });
    expect(body.transaction).not.toHaveProperty('billUrl');
    expect(body.transaction).not.toHaveProperty('billPublicId');
  });

  it('deletes bill assets before deleting transactions and clears the entity cache', async () => {
    const findOne = vi.fn().mockResolvedValue({
      _id: objectIdLike(ids.transaction),
      entityType: 'customer',
      entityId: ids.customer,
      billPublicId: 'bills/to-delete',
    });
    const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne, deleteOne })),
    });

    const { DELETE } = await import('@/app/api/transactions/[id]/route');
    const response = await DELETE(
      jsonRequest('http://localhost/api/transactions/tx', undefined, { method: 'DELETE' }),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteAsset).toHaveBeenCalledWith('bills/to-delete');
    expect(deleteOne).toHaveBeenCalledWith({ _id: expect.any(Object), userId: ids.user });
    expect(mocks.redisDel).toHaveBeenCalledWith(
      `dashboard:stats:${ids.user}`,
      `ledger:customer:${ids.customer}:${ids.user}`,
      `customers:${ids.user}`
    );
  });
});
