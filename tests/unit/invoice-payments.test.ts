import { describe, expect, it } from 'vitest';
import { parseDateOnly, parseInvoiceDate } from '@/lib/invoice-payments';

describe('invoice dates', () => {
  it('parses a valid date-only value at UTC midnight', () => {
    expect(parseDateOnly('2026-07-22', 'Invoice date').toISOString()).toBe(
      '2026-07-22T00:00:00.000Z'
    );
  });

  it('rejects invalid and future invoice dates', () => {
    const now = new Date('2026-08-01T06:00:00.000Z');
    expect(() => parseInvoiceDate('2026-02-30', now)).toThrow('Invoice date is invalid');
    expect(() => parseInvoiceDate('2026-08-02', now)).toThrow(
      'Invoice date cannot be in the future'
    );
  });

  it('defaults to the current business date in India', () => {
    const justAfterMidnightInIndia = new Date('2026-07-31T19:00:00.000Z');
    expect(parseInvoiceDate(undefined, justAfterMidnightInIndia).toISOString()).toBe(
      '2026-08-01T00:00:00.000Z'
    );
  });
});
