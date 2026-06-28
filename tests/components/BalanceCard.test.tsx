import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BalanceCard from '@/components/BalanceCard';

describe('BalanceCard', () => {
  it('renders credits with a positive sign', () => {
    render(<BalanceCard title="Total Credit" amount={12500} type="credit" />);

    expect(screen.getByText('Total Credit')).toBeInTheDocument();
    expect(screen.getByText('+₹12,500')).toBeInTheDocument();
  });

  it('renders debit values without duplicating the sign', () => {
    render(<BalanceCard title="Total Debit" amount={7800} type="debit" />);

    expect(screen.getByText('₹7,800')).toBeInTheDocument();
  });

  it('renders negative balances as money owed', () => {
    render(<BalanceCard title="Net Balance" amount={-2500} type="balance" />);

    expect(screen.getByText('-₹2,500')).toBeInTheDocument();
  });
});
