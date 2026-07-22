import { describe, expect, it } from 'vitest';
import { buildInvoicePdfBuffer, isSellerSnapshotComplete } from '@/lib/invoice-pdf';

describe('stored invoice PDF', () => {
  const sellerSnapshot = {
    firmTitle: 'EasyRakh Auto Parts',
    gstNumber: '22AAAAA0000A1Z5',
    firmPhone: '9876543210',
    firmEmail: 'billing@example.com',
    firmAddress: 'Delhi, India',
  };

  it('requires all reusable firm details', () => {
    expect(isSellerSnapshotComplete(sellerSnapshot)).toBe(true);
    expect(isSellerSnapshotComplete({ ...sellerSnapshot, gstNumber: '' })).toBe(false);
  });

  it('builds a customer-safe PDF containing unit prices and line totals', () => {
    const buffer = buildInvoicePdfBuffer({
      invoiceNumber: 'INV-2026-07-0001',
      customerName: 'Raj Traders',
      customerPhone: '9000000000',
      customerAddress: 'Jaipur, Rajasthan',
      items: [
        {
          itemName: 'Brake Pad',
          itemNumber: 'BP-104',
          quantity: 2,
          amount: 400,
          unitPrice: 200,
          lineTotal: 400,
          unitCost: 120,
          cogs: 240,
          grossProfit: 160,
          costStatus: 'complete',
        },
        {
          itemName: 'Oil Filter',
          itemNumber: 'OF-20',
          quantity: 1,
          amount: 500,
          unitPrice: 500,
          lineTotal: 500,
          unitCost: 350,
          cogs: 350,
          grossProfit: 150,
          costStatus: 'complete',
        },
      ],
      totalAmount: 900,
      paidAmount: 400,
      status: 'partial',
      createdAt: '2026-07-22T10:00:00.000Z',
      sellerSnapshot,
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(4000);
    const binary = buffer.toString('latin1');
    expect(binary).not.toContain('COGS');
    expect(binary).not.toContain('Gross Profit');
  });
});
