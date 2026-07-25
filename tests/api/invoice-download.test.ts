import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, jsonRequest, objectIdLike, routeParams } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserIdFromRequest: vi.fn(),
  cloudinaryAssetsFromFields: vi.fn(),
  downloadRawAsset: vi.fn(),
  buildInvoicePdfBuffer: vi.fn(),
  isSellerSnapshotComplete: vi.fn(),
  sellerSnapshotFromUser: vi.fn(),
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

vi.mock('@/lib/invoice-pdf', () => ({
  buildInvoicePdfBuffer: mocks.buildInvoicePdfBuffer,
  isSellerSnapshotComplete: mocks.isSellerSnapshotComplete,
  sellerSnapshotFromUser: mocks.sellerSnapshotFromUser,
}));

const invoiceId = ids.transaction;
const pdfPublicId = 'ledger-bills/invoices/INV-2026-07-0001.pdf';
const storedInvoice = {
  _id: objectIdLike(invoiceId),
  invoiceNumber: 'INV-2026/07/0001',
  customerName: 'Raj Traders',
  items: [{ itemName: 'Brake pad', quantity: 1, amount: 900 }],
  totalAmount: 900,
  paidAmount: 0,
  status: 'unpaid',
  createdAt: new Date('2026-07-25T10:00:00.000Z'),
  pdfUrl: 'https://res.cloudinary.com/demo/raw/upload/invoice.pdf',
  pdfPublicId,
};

function dbWithInvoice(invoice: unknown, user: unknown = null) {
  const invoiceFindOne = vi.fn().mockResolvedValue(invoice);
  const userFindOne = vi.fn().mockResolvedValue(user);
  return {
    db: {
      collection: vi.fn((name: string) => (
        name === 'invoices' ? { findOne: invoiceFindOne } : { findOne: userFindOne }
      )),
    },
    invoiceFindOne,
    userFindOne,
  };
}

describe('/api/invoices/[id]/download', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getUserIdFromRequest.mockReturnValue(ids.user);
  });

  it('downloads the stored PDF immediately when one exists', async () => {
    const { db, invoiceFindOne, userFindOne } = dbWithInvoice(storedInvoice);
    mocks.getDb.mockResolvedValue(db);
    mocks.cloudinaryAssetsFromFields.mockReturnValue([{
      publicId: pdfPublicId,
      resourceType: 'raw',
    }]);
    mocks.downloadRawAsset.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 stored invoice'),
      contentType: 'application/octet-stream',
    });

    const { GET } = await import('@/app/api/invoices/[id]/download/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/invoices/${invoiceId}/download`),
      routeParams({ id: invoiceId })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="INV-2026-07-0001.pdf"'
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      '%PDF-1.7 stored invoice'
    );
    expect(invoiceFindOne).toHaveBeenCalledWith({
      _id: expect.any(Object),
      userId: ids.user,
    });
    expect(userFindOne).not.toHaveBeenCalled();
    expect(mocks.buildInvoicePdfBuffer).not.toHaveBeenCalled();
  });

  it('regenerates a legacy invoice when saved firm details are complete', async () => {
    const legacyInvoice = {
      ...storedInvoice,
      pdfUrl: undefined,
      pdfPublicId: undefined,
      sellerSnapshot: undefined,
    };
    const user = { firmTitle: 'EasyRakh Auto Parts' };
    const sellerSnapshot = {
      firmTitle: 'EasyRakh Auto Parts',
      gstNumber: 'GST123',
      firmPhone: '9999999999',
      firmEmail: 'firm@example.com',
      firmAddress: 'Delhi',
    };
    const { db } = dbWithInvoice(legacyInvoice, user);
    mocks.getDb.mockResolvedValue(db);
    mocks.cloudinaryAssetsFromFields.mockReturnValue([]);
    mocks.isSellerSnapshotComplete
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mocks.sellerSnapshotFromUser.mockReturnValue(sellerSnapshot);
    mocks.buildInvoicePdfBuffer.mockReturnValue(Buffer.from('%PDF-1.7 regenerated'));

    const { GET } = await import('@/app/api/invoices/[id]/download/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/invoices/${invoiceId}/download`),
      routeParams({ id: invoiceId })
    );

    expect(response.status).toBe(200);
    expect(mocks.sellerSnapshotFromUser).toHaveBeenCalledWith(user);
    expect(mocks.buildInvoicePdfBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: legacyInvoice.invoiceNumber,
        sellerSnapshot,
      })
    );
  });

  it('asks for firm details only when no stored PDF or complete details exist', async () => {
    const legacyInvoice = {
      ...storedInvoice,
      pdfUrl: undefined,
      pdfPublicId: undefined,
      sellerSnapshot: undefined,
    };
    const { db } = dbWithInvoice(legacyInvoice, { firmTitle: '' });
    mocks.getDb.mockResolvedValue(db);
    mocks.cloudinaryAssetsFromFields.mockReturnValue([]);
    mocks.isSellerSnapshotComplete.mockReturnValue(false);
    mocks.sellerSnapshotFromUser.mockReturnValue({
      firmTitle: '',
      gstNumber: '',
      firmPhone: '',
      firmEmail: '',
      firmAddress: '',
    });

    const { GET } = await import('@/app/api/invoices/[id]/download/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/invoices/${invoiceId}/download`),
      routeParams({ id: invoiceId })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Complete your firm details before downloading this invoice.',
      code: 'FIRM_DETAILS_REQUIRED',
    });
    expect(mocks.buildInvoicePdfBuffer).not.toHaveBeenCalled();
  });

  it('does not expose another user’s invoice', async () => {
    const { db } = dbWithInvoice(null);
    mocks.getDb.mockResolvedValue(db);

    const { GET } = await import('@/app/api/invoices/[id]/download/route');
    const response = await GET(
      jsonRequest(`http://localhost/api/invoices/${invoiceId}/download`),
      routeParams({ id: invoiceId })
    );

    expect(response.status).toBe(404);
    expect(mocks.downloadRawAsset).not.toHaveBeenCalled();
  });
});
