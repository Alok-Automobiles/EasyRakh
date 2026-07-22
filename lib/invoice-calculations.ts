import type { InvoiceItem } from './types';

export const INVOICE_PRICING_VERSION = 2;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function legacyUnitPrice(item: Pick<InvoiceItem, 'quantity' | 'amount' | 'unitPrice'>) {
  if (typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice)) {
    return item.unitPrice;
  }
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return 0;
  return roundMoney((item.amount || 0) / item.quantity);
}

export function invoiceLineTotal(item: Pick<InvoiceItem, 'quantity' | 'amount' | 'unitPrice' | 'lineTotal'>) {
  if (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)) {
    return item.lineTotal;
  }
  if (typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice)) {
    return roundMoney(item.quantity * item.unitPrice);
  }
  return roundMoney(item.amount || 0);
}

export function calculateInvoiceLine({
  quantity,
  unitPrice,
  unitCost,
}: {
  quantity: number;
  unitPrice: number;
  unitCost: number;
}) {
  const lineTotal = roundMoney(quantity * unitPrice);
  const cogs = roundMoney(quantity * unitCost);
  const grossProfit = roundMoney(lineTotal - cogs);

  return { lineTotal, cogs, grossProfit };
}

export function calculateInvoiceTotals(items: InvoiceItem[]) {
  const totalAmount = roundMoney(
    items.reduce((sum, item) => sum + invoiceLineTotal(item), 0)
  );
  const costedItems = items.filter(
    (item) => item.costStatus !== 'missing' && typeof item.cogs === 'number'
  );
  const totalCogs = roundMoney(
    costedItems.reduce((sum, item) => sum + Number(item.cogs || 0), 0)
  );
  const costedSales = roundMoney(
    costedItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0)
  );
  const uncostedSales = roundMoney(totalAmount - costedSales);
  const grossProfit = roundMoney(costedSales - totalCogs);
  const grossMargin = costedSales > 0
    ? roundPercent((grossProfit / costedSales) * 100)
    : 0;

  return {
    totalAmount,
    totalCogs,
    costedSales,
    uncostedSales,
    missingCostItemCount: items.length - costedItems.length,
    grossProfit,
    grossMargin,
  };
}

export function deriveInvoiceStatus(totalAmount: number, paidAmount: number) {
  if (totalAmount > 0 && paidAmount >= totalAmount) return 'paid' as const;
  if (paidAmount > 0) return 'partial' as const;
  return 'unpaid' as const;
}
