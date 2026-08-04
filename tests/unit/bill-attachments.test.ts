import { describe, expect, it } from 'vitest';
import {
  getDailyCashBillViewUrl,
  getTransactionBillViewUrl,
  isPdfBillAttachment,
} from '@/lib/bill-attachments';

describe('bill attachment view URLs', () => {
  it('routes PDFs through the authenticated daily cash endpoint', () => {
    const attachment = {
      id: 'entry/id',
      billUrl: 'https://res.cloudinary.com/demo/raw/upload/invoice',
      billPublicId: 'ledger-bills/invoice.pdf',
    };

    expect(isPdfBillAttachment(attachment)).toBe(true);
    expect(getDailyCashBillViewUrl('record/id', attachment)).toBe(
      '/api/daily-cash-records/record%2Fid/entries/entry%2Fid/bill'
    );
  });

  it('keeps image attachments on their existing URL', () => {
    const attachment = {
      id: 'entry',
      billUrl: 'https://res.cloudinary.com/demo/image/upload/bill.jpg',
      billPublicId: 'ledger-bills/bill',
    };

    expect(isPdfBillAttachment(attachment)).toBe(false);
    expect(getDailyCashBillViewUrl('record', attachment)).toBe(attachment.billUrl);
    expect(getTransactionBillViewUrl('transaction', attachment)).toBe(attachment.billUrl);
  });

  it('routes ledger transaction PDFs through the authenticated transaction endpoint', () => {
    const attachment = {
      billUrl: 'https://res.cloudinary.com/demo/raw/upload/invoice',
      billPublicId: 'ledger-bills/invoice.pdf',
    };

    expect(getTransactionBillViewUrl('transaction/id', attachment)).toBe(
      '/api/transactions/transaction%2Fid/bill'
    );
  });

  it('returns an empty URL when no attachment is present', () => {
    expect(getDailyCashBillViewUrl('record', { id: 'entry' })).toBe('');
  });
});
