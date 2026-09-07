import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import SalesProfitSummary from '@/app/dashboard/SalesProfitSummary';
import type { InvoiceProfitSummary } from '@/lib/invoice-calculations';

const allInvoices: InvoiceProfitSummary = {
  totalSales: 12000,
  totalCogs: 7000,
  costedSales: 11000,
  uncostedSales: 1000,
  missingCostItemCount: 2,
  grossProfit: 4000,
  grossMargin: 36.36,
};

const paidOnly: InvoiceProfitSummary = {
  totalSales: 6000,
  totalCogs: 3500,
  costedSales: 6000,
  uncostedSales: 0,
  missingCostItemCount: 0,
  grossProfit: 2500,
  grossMargin: 41.67,
};

const emptySummary: InvoiceProfitSummary = {
  totalSales: 0,
  totalCogs: 0,
  costedSales: 0,
  uncostedSales: 0,
  missingCostItemCount: 0,
  grossProfit: 0,
  grossMargin: 0,
};

describe('SalesProfitSummary', () => {
  it('defaults to all invoices and switches every metric to fully paid invoices', async () => {
    const user = userEvent.setup();
    render(
      <SalesProfitSummary
        allInvoices={allInvoices}
        paidOnly={paidOnly}
        periodLabel="August 2026"
      />
    );

    const allButton = screen.getByRole('button', { name: 'All invoices' });
    const paidButton = screen.getByRole('button', { name: 'Paid only' });
    expect(allButton).toHaveAttribute('aria-pressed', 'true');
    expect(paidButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Profit Summary - August 2026')).toBeInTheDocument();
    expect(screen.getByText('₹12,000')).toBeInTheDocument();
    expect(screen.getByText('₹7,000')).toBeInTheDocument();
    expect(screen.getByText('₹4,000')).toBeInTheDocument();
    expect(screen.getByText('36.36%')).toBeInTheDocument();
    expect(screen.getByText(/2 historical item\(s\) are missing a cost price/)).toBeInTheDocument();

    await user.click(paidButton);

    expect(allButton).toHaveAttribute('aria-pressed', 'false');
    expect(paidButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('₹6,000')).toBeInTheDocument();
    expect(screen.getByText('₹3,500')).toBeInTheDocument();
    expect(screen.getByText('₹2,500')).toBeInTheDocument();
    expect(screen.getByText('41.67%')).toBeInTheDocument();
    expect(screen.getByText(/partial and unpaid are excluded/i)).toBeInTheDocument();
    expect(screen.queryByText(/historical item\(s\) are missing a cost price/)).not.toBeInTheDocument();
  });

  it('shows zero values when the period has no fully paid invoices', async () => {
    const user = userEvent.setup();
    render(<SalesProfitSummary allInvoices={allInvoices} paidOnly={emptySummary} />);

    await user.click(screen.getByRole('button', { name: 'Paid only' }));

    const metrics = screen.getByLabelText('Paid only profit metrics');
    expect(within(metrics).getAllByText('₹0')).toHaveLength(3);
    expect(within(metrics).getByText('0.00%')).toBeInTheDocument();
    expect(screen.queryByText('₹12,000')).not.toBeInTheDocument();
  });
});
