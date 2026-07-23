import { describe, expect, it } from 'vitest';
import {
  calculateInvoiceLine,
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  legacyUnitPrice,
} from '@/lib/invoice-calculations';

describe('invoice calculations', () => {
  it('calculates unit-price sales, COGS, profit, and margin', () => {
    const first = calculateInvoiceLine({ quantity: 2, unitPrice: 200, unitCost: 120 });
    const second = calculateInvoiceLine({ quantity: 1, unitPrice: 500, unitCost: 350 });
    const totals = calculateInvoiceTotals([
      { itemName: 'Brake Pad', quantity: 2, amount: first.lineTotal, unitPrice: 200, unitCost: 120, ...first, costStatus: 'complete' },
      { itemName: 'Oil Filter', quantity: 1, amount: second.lineTotal, unitPrice: 500, unitCost: 350, ...second, costStatus: 'complete' },
    ]);

    expect(totals).toMatchObject({
      totalAmount: 900,
      totalCogs: 590,
      grossProfit: 310,
      grossMargin: 34.44,
      missingCostItemCount: 0,
    });
  });

  it('preserves a legacy line total and excludes missing costs from profit', () => {
    const legacy = { itemName: 'Old item', quantity: 2, amount: 200, costStatus: 'missing' as const };
    expect(legacyUnitPrice(legacy)).toBe(100);
    expect(calculateInvoiceTotals([legacy])).toMatchObject({
      totalAmount: 200,
      costedSales: 0,
      uncostedSales: 200,
      grossProfit: 0,
      grossMargin: 0,
      missingCostItemCount: 1,
    });
  });

  it('derives payment status without treating an empty invoice as paid', () => {
    expect(deriveInvoiceStatus(0, 0)).toBe('unpaid');
    expect(deriveInvoiceStatus(900, 400)).toBe('partial');
    expect(deriveInvoiceStatus(900, 900)).toBe('paid');
  });
});
