'use client';

import { useState } from 'react';
import type { InvoiceProfitSummary } from '@/lib/invoice-calculations';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

type ProfitScope = 'all' | 'paid';

interface SalesProfitSummaryProps {
  allInvoices: InvoiceProfitSummary;
  paidOnly: InvoiceProfitSummary;
  periodLabel?: string;
}

export default function SalesProfitSummary({
  allInvoices,
  paidOnly,
  periodLabel,
}: SalesProfitSummaryProps) {
  const [profitScope, setProfitScope] = useState<ProfitScope>('all');
  const summary = profitScope === 'paid' ? paidOnly : allInvoices;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-md transition-shadow hover:shadow-lg sm:p-4 lg:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 sm:text-xs">
            Sales and Profit
          </p>
          <h3 className="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">
            {periodLabel ? `Profit Summary - ${periodLabel}` : 'Profit Summary - This Month'}
          </h3>
        </div>

        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div
            className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5"
            role="group"
            aria-label="Profit invoice scope"
          >
            <button
              type="button"
              aria-pressed={profitScope === 'all'}
              onClick={() => setProfitScope('all')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all sm:px-3 ${
                profitScope === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              All invoices
            </button>
            <button
              type="button"
              aria-pressed={profitScope === 'paid'}
              onClick={() => setProfitScope('paid')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all sm:px-3 ${
                profitScope === 'paid'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Paid only
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {profitScope === 'paid'
              ? 'Fully paid invoices only; partial and unpaid are excluded.'
              : 'Invoice sales are separate from cash received.'}
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4"
        aria-label={`${profitScope === 'paid' ? 'Paid only' : 'All invoices'} profit metrics`}
        aria-live="polite"
      >
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-blue-700 sm:text-xs">Total Sales</p>
          <p className="mt-1 text-lg font-bold text-gray-900 sm:text-xl">{formatCurrency(summary.totalSales)}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-amber-700 sm:text-xs">Total COGS</p>
          <p className="mt-1 text-lg font-bold text-gray-900 sm:text-xl">{formatCurrency(summary.totalCogs)}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-emerald-700 sm:text-xs">Gross Profit</p>
          <p className="mt-1 text-lg font-bold text-gray-900 sm:text-xl">{formatCurrency(summary.grossProfit)}</p>
        </div>
        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-purple-700 sm:text-xs">Gross Margin</p>
          <p className="mt-1 text-lg font-bold text-gray-900 sm:text-xl">{summary.grossMargin.toFixed(2)}%</p>
        </div>
      </div>

      {summary.missingCostItemCount > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {summary.missingCostItemCount} historical item(s) are missing a cost price. Profit excludes{' '}
          {formatCurrency(summary.uncostedSales)} of sales until those costs are filled.
        </div>
      )}
    </div>
  );
}
