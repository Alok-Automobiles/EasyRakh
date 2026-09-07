import { describe, expect, it } from 'vitest';
import {
  calculateInvoiceLine,
  calculateInvoiceProfitViews,
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

  it('builds separate all-invoice and fully-paid profit summaries', () => {
    const paidItems = [
      {
        itemName: 'Brake Pad',
        quantity: 2,
        amount: 900,
        lineTotal: 900,
        cogs: 590,
        costStatus: 'complete' as const,
      },
    ];
    const partialLegacyItems = [
      {
        itemName: 'Legacy item',
        quantity: 2,
        amount: 200,
        costStatus: 'missing' as const,
      },
    ];
    const unpaidItems = [
      {
        itemName: 'Oil Filter',
        quantity: 1,
        amount: 500,
        lineTotal: 500,
        cogs: 350,
        costStatus: 'complete' as const,
      },
    ];

    const views = calculateInvoiceProfitViews([
      { items: paidItems, status: 'paid' },
      { items: partialLegacyItems, status: 'partial' },
      { items: unpaidItems, status: 'unpaid' },
    ]);

    expect(views.salesProfit).toEqual({
      totalSales: 1600,
      totalCogs: 940,
      costedSales: 1400,
      uncostedSales: 200,
      missingCostItemCount: 1,
      grossProfit: 460,
      grossMargin: 32.86,
    });
    expect(views.paidSalesProfit).toEqual({
      totalSales: 900,
      totalCogs: 590,
      costedSales: 900,
      uncostedSales: 0,
      missingCostItemCount: 0,
      grossProfit: 310,
      grossMargin: 34.44,
    });
  });
});
