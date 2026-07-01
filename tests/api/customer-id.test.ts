import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  redisDel: vi.fn(),
  cloudinaryAssetsFromFields: vi.fn(),
  deleteCloudinaryAssets: vi.fn(),
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

vi.mock('@/lib/cloudinary-cleanup', () => ({
  cloudinaryAssetsFromFields: mocks.cloudinaryAssetsFromFields,
  deleteCloudinaryAssets: mocks.deleteCloudinaryAssets,
}));

describe('/api/customers/[id]', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.redisDel.mockReset();
    mocks.cloudinaryAssetsFromFields.mockReset();
    mocks.deleteCloudinaryAssets.mockReset();

    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
    mocks.redisDel.mockResolvedValue(1);
    mocks.cloudinaryAssetsFromFields.mockImplementation(({ publicIds }) =>
      (publicIds || []).filter(Boolean).map((publicId: string) => ({ publicId }))
    );
    mocks.deleteCloudinaryAssets.mockResolvedValue(undefined);
  });

  it('deletes opening balance and transaction bill assets before deleting customer records', async () => {
    const customer = {
      _id: objectIdLike(ids.customer),
      openingBalanceBillUrl: 'https://res.cloudinary.com/demo/image/upload/opening.jpg',
      openingBalanceBillPublicId: 'customers/opening',
    };
    const transactionCursor = {
      toArray: vi.fn().mockResolvedValue([
        {
          billUrl: 'https://res.cloudinary.com/demo/image/upload/transaction.jpg',
          billPublicId: 'transactions/bill',
        },
      ]),
    };
    const customers = {
      findOne: vi.fn().mockResolvedValue(customer),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const transactions = {
      find: vi.fn(() => transactionCursor),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => (name === 'customers' ? customers : transactions)),
    });

    const { DELETE } = await import('@/app/api/customers/[id]/route');
    const response = await DELETE(
      jsonRequest('http://localhost/api/customers/customer', undefined, { method: 'DELETE' }),
      routeParams({ id: ids.customer })
    );

    expect(response.status).toBe(200);
    expect(transactions.find).toHaveBeenCalledWith(
      {
        $or: [
          { customerId: ids.customer, userId: ids.user },
          { entityId: ids.customer, entityType: 'customer', userId: ids.user },
        ],
      },
      { projection: { billPublicId: 1, billUrl: 1 } }
    );
    expect(mocks.deleteCloudinaryAssets).toHaveBeenCalledWith([
      { publicId: 'customers/opening' },
      { publicId: 'transactions/bill' },
    ]);
    expect(mocks.deleteCloudinaryAssets.mock.invocationCallOrder[0]).toBeLessThan(
      transactions.deleteMany.mock.invocationCallOrder[0]
    );
    expect(transactions.deleteMany).toHaveBeenCalled();
    expect(customers.deleteOne).toHaveBeenCalledWith({ _id: expect.any(Object), userId: ids.user });
  });

  it('keeps customer and transaction records when Cloudinary cleanup fails', async () => {
    const customers = {
      findOne: vi.fn().mockResolvedValue({
        _id: objectIdLike(ids.customer),
        openingBalanceBillPublicId: 'customers/opening',
      }),
      deleteOne: vi.fn(),
    };
    const transactions = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      deleteMany: vi.fn(),
    };
    mocks.deleteCloudinaryAssets.mockRejectedValue(new Error('Cloudinary unavailable'));
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => (name === 'customers' ? customers : transactions)),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { DELETE } = await import('@/app/api/customers/[id]/route');
    const response = await DELETE(
      jsonRequest('http://localhost/api/customers/customer', undefined, { method: 'DELETE' }),
      routeParams({ id: ids.customer })
    );
    error.mockRestore();

    expect(response.status).toBe(502);
    expect(transactions.deleteMany).not.toHaveBeenCalled();
    expect(customers.deleteOne).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to delete associated uploaded files',
    });
  });
});
