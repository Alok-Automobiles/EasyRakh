import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  cloudinaryAssetsFromFields: vi.fn(),
  downloadRawAsset: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));

vi.mock('@/lib/mongodb', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/lib/cloudinary-cleanup', () => ({
  cloudinaryAssetsFromFields: mocks.cloudinaryAssetsFromFields,
}));

vi.mock('@/lib/cloudinary', () => ({
  downloadRawAsset: mocks.downloadRawAsset,
}));

const recordId = ids.customer;
const entryId = ids.transaction;
const billUrl = 'https://res.cloudinary.com/demo/raw/upload/v1/ledger-bills/invoice.pdf';
const billPublicId = 'ledger-bills/invoice.pdf';

describe('/api/daily-cash-records/[id]/entries/[entryId]/bill', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.cloudinaryAssetsFromFields.mockReset();
    mocks.downloadRawAsset.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
  });

  it('requires an authenticated user before accessing the database', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);
    const { GET } = await import(
      '@/app/api/daily-cash-records/[id]/entries/[entryId]/bill/route'
    );
    const response = await GET(
      jsonRequest(`http://localhost/api/daily-cash-records/${recordId}/entries/${entryId}/bill`),
      routeParams({ id: recordId, entryId })
    );

    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('rejects invalid record or entry IDs before accessing the database', async () => {
    const { GET } = await import(
      '@/app/api/daily-cash-records/[id]/entries/[entryId]/bill/route'
    );
    const response = await GET(
      jsonRequest('http://localhost/api/daily-cash-records/bad/entries/bad/bill'),
      routeParams({ id: 'bad', entryId: 'bad' })
    );

    expect(response.status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('serves an owned Cloudinary PDF through the authenticated app route', async () => {
    const findOne = vi.fn().mockResolvedValue({
      entries: [{
        _id: objectIdLike(entryId),
        billUrl,
        billPublicId,
      }],
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });
    mocks.cloudinaryAssetsFromFields.mockReturnValue([{
      publicId: billPublicId,
      resourceType: 'raw',
    }]);
    mocks.downloadRawAsset.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 secure invoice'),
      // Raw assets can be returned as octet-stream on some Cloudinary plans.
      // The route validates the PDF signature and sets the browser MIME type.
      contentType: 'application/octet-stream',
    });

    const { GET } = await import(
      '@/app/api/daily-cash-records/[id]/entries/[entryId]/bill/route'
    );
    const response = await GET(
      jsonRequest(`http://localhost/api/daily-cash-records/${recordId}/entries/${entryId}/bill`),
      routeParams({ id: recordId, entryId })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('invoice.pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      '%PDF-1.7 secure invoice'
    );
    expect(findOne).toHaveBeenCalledWith(
      {
        _id: expect.any(Object),
        userId: ids.user,
        'entries._id': expect.any(Object),
      },
      {
        projection: {
          entries: { $elemMatch: { _id: expect.any(Object) } },
        },
      }
    );
    expect(mocks.cloudinaryAssetsFromFields).toHaveBeenCalledWith({
      publicIds: [billPublicId],
      urls: [billUrl],
    });
    expect(mocks.downloadRawAsset).toHaveBeenCalledWith(billPublicId);
  });

  it('does not expose an attachment outside the signed-in user record', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });

    const { GET } = await import(
      '@/app/api/daily-cash-records/[id]/entries/[entryId]/bill/route'
    );
    const response = await GET(
      jsonRequest(`http://localhost/api/daily-cash-records/${recordId}/entries/${entryId}/bill`),
      routeParams({ id: recordId, entryId })
    );

    expect(response.status).toBe(404);
    expect(mocks.downloadRawAsset).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF attachment instead of proxying arbitrary files', async () => {
    const findOne = vi.fn().mockResolvedValue({
      entries: [{
        _id: objectIdLike(entryId),
        billUrl: 'https://res.cloudinary.com/demo/image/upload/bill.jpg',
        billPublicId: 'ledger-bills/bill',
      }],
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });
    mocks.cloudinaryAssetsFromFields.mockReturnValue([{
      publicId: 'ledger-bills/bill',
      resourceType: 'image',
    }]);

    const { GET } = await import(
      '@/app/api/daily-cash-records/[id]/entries/[entryId]/bill/route'
    );
    const response = await GET(
      jsonRequest(`http://localhost/api/daily-cash-records/${recordId}/entries/${entryId}/bill`),
      routeParams({ id: recordId, entryId })
    );

    expect(response.status).toBe(404);
    expect(mocks.downloadRawAsset).not.toHaveBeenCalled();
  });

  it('fails safely when Cloudinary does not return valid PDF bytes', async () => {
    const findOne = vi.fn().mockResolvedValue({
      entries: [{ _id: objectIdLike(entryId), billUrl, billPublicId }],
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });
    mocks.cloudinaryAssetsFromFields.mockReturnValue([{
      publicId: billPublicId,
      resourceType: 'raw',
    }]);
    mocks.downloadRawAsset.mockResolvedValue({
      buffer: Buffer.from('not a PDF'),
      contentType: 'text/plain',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { GET } = await import(
      '@/app/api/daily-cash-records/[id]/entries/[entryId]/bill/route'
    );
    const response = await GET(
      jsonRequest(`http://localhost/api/daily-cash-records/${recordId}/entries/${entryId}/bill`),
      routeParams({ id: recordId, entryId })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load the bill attachment',
    });
    errorSpy.mockRestore();
  });
});
