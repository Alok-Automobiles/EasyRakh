import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, routeParams } from '@/tests/helpers/api';

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

const billUrl = 'https://res.cloudinary.com/demo/raw/upload/v1/ledger-bills/invoice.pdf';
const billPublicId = 'ledger-bills/invoice.pdf';

describe('/api/transactions/[id]/bill', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getUserIdFromRequest.mockReset();
    mocks.cloudinaryAssetsFromFields.mockReset();
    mocks.downloadRawAsset.mockReset();
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
  });

  it('requires authentication before reading a transaction', async () => {
    mocks.getUserIdFromRequest.mockReturnValue(null);
    const { GET } = await import('@/app/api/transactions/[id]/bill/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/transactions/${ids.transaction}/bill`),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('serves an owned ledger PDF inline through the authenticated app route', async () => {
    const findOne = vi.fn().mockResolvedValue({ billUrl, billPublicId });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn(() => ({ findOne })),
    });
    mocks.cloudinaryAssetsFromFields.mockReturnValue([{
      publicId: billPublicId,
      resourceType: 'raw',
    }]);
    mocks.downloadRawAsset.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 ledger invoice'),
      contentType: 'application/octet-stream',
    });

    const { GET } = await import('@/app/api/transactions/[id]/bill/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/transactions/${ids.transaction}/bill`),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('invoice.pdf');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      '%PDF-1.7 ledger invoice'
    );
    expect(findOne).toHaveBeenCalledWith(
      { _id: expect.any(Object), userId: ids.user },
      {
        projection: {
          billUrl: 1,
          billPublicId: 1,
          invoiceId: 1,
          description: 1,
        },
      }
    );
    expect(mocks.downloadRawAsset).toHaveBeenCalledWith(billPublicId);
  });

  it('falls back to the invoice PDF for a legacy ledger transaction', async () => {
    const transactionFindOne = vi.fn().mockResolvedValue({
      description: 'Invoice INV-2026-07-0001 - Amount due',
    });
    const invoiceFindOne = vi.fn().mockResolvedValue({
      pdfUrl: billUrl,
      pdfPublicId: billPublicId,
    });
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => (
        name === 'transactions'
          ? { findOne: transactionFindOne }
          : { findOne: invoiceFindOne }
      )),
    });
    mocks.cloudinaryAssetsFromFields.mockReturnValue([{
      publicId: billPublicId,
      resourceType: 'raw',
    }]);
    mocks.downloadRawAsset.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 legacy ledger invoice'),
    });

    const { GET } = await import('@/app/api/transactions/[id]/bill/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/transactions/${ids.transaction}/bill`),
      routeParams({ id: ids.transaction })
    );

    expect(response.status).toBe(200);
    expect(invoiceFindOne).toHaveBeenCalledWith(
      {
        userId: ids.user,
        $or: [
          { transactionId: ids.transaction },
          { 'payments.ledgerTransactionId': ids.transaction },
        ],
      },
      { projection: { pdfUrl: 1, pdfPublicId: 1 } }
    );
  });
});
