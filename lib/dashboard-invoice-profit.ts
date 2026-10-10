import type { Document } from 'mongodb';
import type { Invoice } from './types';
import {
  calculateInvoiceProfitViews,
  roundMoney,
  roundPercent,
  type InvoiceProfitSummary,
} from './invoice-calculations';

// New invoices store their profit totals. Aggregate those in MongoDB instead of
// transferring an entire month of item arrays to a serverless function.
const storedProfitFields = [
  'totalAmount',
  'totalCogs',
  'costedSales',
  'uncostedSales',
  'missingCostItemCount',
] as const;

const hasStoredProfit = Object.fromEntries(
  storedProfitFields.map((field) => [field, { $type: 'number' }])
);

export function storedInvoiceProfitPipeline(periodQuery: Document): Document[] {
  const sum = (field: string) => ({ $sum: `$${field}` });
  const paidSum = (field: string) => ({
    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, `$${field}`, 0] },
  });

  return [
    { $match: periodQuery },
    { $match: hasStoredProfit },
    {
      $group: {
        _id: null,
        totalSales: sum('totalAmount'),
        totalCogs: sum('totalCogs'),
        costedSales: sum('costedSales'),
        uncostedSales: sum('uncostedSales'),
        missingCostItemCount: sum('missingCostItemCount'),
        paidTotalSales: paidSum('totalAmount'),
        paidTotalCogs: paidSum('totalCogs'),
        paidCostedSales: paidSum('costedSales'),
        paidUncostedSales: paidSum('uncostedSales'),
        paidMissingCostItemCount: paidSum('missingCostItemCount'),
      },
    },
  ];
}

export function legacyInvoiceProfitQuery(periodQuery: Document): Document {
  return { $and: [periodQuery, { $nor: [hasStoredProfit] }] };
}

export interface StoredInvoiceProfitTotals {
  totalSales?: number;
  totalCogs?: number;
  costedSales?: number;
  uncostedSales?: number;
  missingCostItemCount?: number;
  paidTotalSales?: number;
  paidTotalCogs?: number;
  paidCostedSales?: number;
  paidUncostedSales?: number;
  paidMissingCostItemCount?: number;
}

type LegacyInvoiceProfitInput = Partial<Pick<
  Invoice,
  'items' | 'totalAmount' | 'totalCogs' | 'costedSales' | 'uncostedSales' | 'missingCostItemCount' | 'status'
>>;

function mergedSummary(
  stored: StoredInvoiceProfitTotals | undefined,
  legacy: InvoiceProfitSummary,
  paid: boolean
): InvoiceProfitSummary {
  const storedNumber = (field: keyof StoredInvoiceProfitTotals) => Number(stored?.[field] || 0);
  const field = (name: keyof StoredInvoiceProfitTotals): keyof StoredInvoiceProfitTotals =>
    paid ? (`paid${name[0].toUpperCase()}${name.slice(1)}` as keyof StoredInvoiceProfitTotals) : name;
  const totalSales = roundMoney(storedNumber(field('totalSales')) + legacy.totalSales);
  const totalCogs = roundMoney(storedNumber(field('totalCogs')) + legacy.totalCogs);
  const costedSales = roundMoney(storedNumber(field('costedSales')) + legacy.costedSales);
  const uncostedSales = roundMoney(storedNumber(field('uncostedSales')) + legacy.uncostedSales);
  const missingCostItemCount = storedNumber(field('missingCostItemCount')) + legacy.missingCostItemCount;
  const grossProfit = roundMoney(costedSales - totalCogs);

  return {
    totalSales,
    totalCogs,
    costedSales,
    uncostedSales,
    missingCostItemCount,
    grossProfit,
    grossMargin: costedSales > 0 ? roundPercent((grossProfit / costedSales) * 100) : 0,
  };
}

export function combineInvoiceProfitViews(
  stored: StoredInvoiceProfitTotals | undefined,
  legacyInvoices: LegacyInvoiceProfitInput[]
) {
  const legacy = calculateInvoiceProfitViews(legacyInvoices);
  return {
    salesProfit: mergedSummary(stored, legacy.salesProfit, false),
    paidSalesProfit: mergedSummary(stored, legacy.paidSalesProfit, true),
  };
}
