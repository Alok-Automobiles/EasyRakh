import { describe, expect, it } from 'vitest';
import { buildInvoiceListPdfBuffer } from '@/lib/invoice-list-pdf';
import { readInvoiceListState, invoiceListParams } from '@/lib/invoice-list-state';

describe('invoice list report', () => {
  it('preserves the combined outstanding filter in URLs', () => {
    const state = readInvoiceListState(new URLSearchParams('status=outstanding'));
    expect(state.status).toBe('outstanding');
    expect(invoiceListParams(state).get('status')).toBe('outstanding');
  });
  it('includes invoice details, balances, totals and page numbering across pages', () => {
    const buffer = buildInvoiceListPdfBuffer(Array.from({ length: 65 }, (_, index) => ({
      invoiceNumber: `INV-${index}`, customerName: 'Raj Traders', customerPhone: '9876543210',
      createdAt: '2026-11-16T00:00:00Z', totalAmount: 1000, paidAmount: 250, status: 'partial',
    })), { status: 'outstanding' });
    const pdf = buffer.toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    for (const text of ['INV-64', 'Raj Traders', '9876543210', '750.00', '65,000.00', '16,250.00', '48,750.00', 'Page 2 of']) {
      expect(pdf).toContain(text);
    }
  });
});
