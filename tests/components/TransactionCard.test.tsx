import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TransactionCard from '@/components/TransactionCard';

const baseTransaction = {
  id: 'tx-1',
  userId: 'user-1',
  entityType: 'customer',
  entityId: 'customer-1',
  customerName: 'Raj Traders',
  type: 'credit' as const,
  amount: 12500,
  description: 'Payment received',
  date: new Date('2026-06-20T00:00:00.000Z'),
  createdAt: new Date('2026-06-20T09:00:00.000Z'),
};

describe('TransactionCard', () => {
  it('renders credit transaction details', () => {
    render(<TransactionCard transaction={baseTransaction} />);

    expect(screen.getByText('Credit')).toBeInTheDocument();
    expect(screen.getByText('Raj Traders')).toBeInTheDocument();
    expect(screen.getByText('Payment received')).toBeInTheDocument();
    expect(screen.getByText('+₹12,500')).toBeInTheDocument();
    expect(screen.getByText('Jun 20, 2026')).toBeInTheDocument();
  });

  it('renders debit transactions with a negative amount', () => {
    render(
      <TransactionCard
        transaction={{
          ...baseTransaction,
          type: 'debit',
          amount: 7800,
        }}
      />
    );

    expect(screen.getByText('Debit')).toBeInTheDocument();
    expect(screen.getByText('-₹7,800')).toBeInTheDocument();
  });

  it('calls edit and delete callbacks', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <TransactionCard
        transaction={baseTransaction}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(onEdit).toHaveBeenCalledWith(baseTransaction);
    expect(onDelete).toHaveBeenCalledWith('tx-1');
  });
});
