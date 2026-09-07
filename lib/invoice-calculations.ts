import type { Invoice, InvoiceItem } from './types';

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

export interface InvoiceProfitSummary {
  totalSales: number;
  totalCogs: number;
  costedSales: number;
  uncostedSales: number;
  missingCostItemCount: number;
  grossProfit: number;
  grossMargin: number;
}

type InvoiceProfitSource = Partial<
  Pick<
    Invoice,
    | 'items'
    | 'totalAmount'
    | 'totalCogs'
    | 'costedSales'
    | 'uncostedSales'
    | 'missingCostItemCount'
    | 'status'
  >
>;

export function calculateInvoicesProfitSummary(
  invoices: InvoiceProfitSource[]
): InvoiceProfitSummary {
  const totals = invoices.reduce<
    Omit<InvoiceProfitSummary, 'grossProfit' | 'grossMargin'>
  >(
    (summary, invoice) => {
      const calculated = calculateInvoiceTotals(invoice.items || []);
      summary.totalSales += Number(invoice.totalAmount ?? calculated.totalAmount ?? 0);
      summary.totalCogs += Number(invoice.totalCogs ?? calculated.totalCogs ?? 0);
      summary.costedSales += Number(invoice.costedSales ?? calculated.costedSales ?? 0);
      summary.uncostedSales += Number(invoice.uncostedSales ?? calculated.uncostedSales ?? 0);
      summary.missingCostItemCount += Number(
        invoice.missingCostItemCount ?? calculated.missingCostItemCount ?? 0
      );
      return summary;
    },
    {
      totalSales: 0,
      totalCogs: 0,
      costedSales: 0,
      uncostedSales: 0,
      missingCostItemCount: 0,
    }
  );

  const totalSales = roundMoney(totals.totalSales);
  const totalCogs = roundMoney(totals.totalCogs);
  const costedSales = roundMoney(totals.costedSales);
  const uncostedSales = roundMoney(totals.uncostedSales);
  const grossProfit = roundMoney(costedSales - totalCogs);
  const grossMargin = costedSales > 0
    ? roundPercent((grossProfit / costedSales) * 100)
    : 0;

  return {
    totalSales,
    totalCogs,
    costedSales,
    uncostedSales,
    missingCostItemCount: totals.missingCostItemCount,
    grossProfit,
    grossMargin,
  };
}

export function calculateInvoiceProfitViews(invoices: InvoiceProfitSource[]) {
  return {
    salesProfit: calculateInvoicesProfitSummary(invoices),
    paidSalesProfit: calculateInvoicesProfitSummary(
      invoices.filter((invoice) => invoice.status === 'paid')
    ),
  };
}

export function deriveInvoiceStatus(totalAmount: number, paidAmount: number) {
  if (totalAmount > 0 && paidAmount >= totalAmount) return 'paid' as const;
  if (paidAmount > 0) return 'partial' as const;
  return 'unpaid' as const;
}
