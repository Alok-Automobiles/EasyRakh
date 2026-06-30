import { describe, expect, it } from 'vitest';
import { getInvoiceItemDisplayRows, getInvoicePdfTableRows } from '@/lib/invoice-format';

describe('invoice item formatting', () => {
  it('preserves the five-column invoice item format for display and PDF rows', () => {
    const items = [
      {
        inventoryItemId: '507f1f77bcf86cd799439016',
        itemNumber: 'BP-104',
        itemName: 'BRAKE PAD',
        quantity: 2,
        amount: 900,
      },
      {
        itemName: 'LABOUR',
        quantity: 1,
        amount: 250,
      },
    ];

    expect(getInvoiceItemDisplayRows(items)).toEqual([
      {
        serialNumber: '1',
        itemNumber: 'BP-104',
        itemName: 'BRAKE PAD',
        quantity: '2',
        amount: 900,
      },
      {
        serialNumber: '2',
        itemNumber: '-',
        itemName: 'LABOUR',
        quantity: '1',
        amount: 250,
      },
    ]);

    expect(getInvoicePdfTableRows(items)).toEqual([
      ['1', 'BP-104', 'BRAKE PAD', '2', 'Rs 900'],
      ['2', '-', 'LABOUR', '1', 'Rs 250'],
    ]);
  });
});
