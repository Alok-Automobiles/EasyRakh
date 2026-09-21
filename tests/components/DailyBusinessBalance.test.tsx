import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DailyBusinessBalance from '@/components/DailyBusinessBalance';

const mocks = vi.hoisted(() => ({ query: vi.fn(), request: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/hooks/useSupplierPayments', () => ({
  useBusinessCash: mocks.query, supplierRequest: mocks.request,
  useRefreshSupplierPayments: () => mocks.refresh,
  formatMoney: (amount: number) => `₹${amount.toFixed(2)}`,
}));

describe('Daily Cash balance confirmation', () => {
  beforeEach(() => {
    mocks.query.mockReturnValue({ data: { enabled: true, businessCash: {
      currentBalance: 218400, protectedAmount: 30000, version: 7, anchorVersion: 2, needsReconciliation: true,
    } } });
    mocks.request.mockReset(); mocks.refresh.mockReset();
  });
  it('is absent when supplier payments are disabled', () => {
    mocks.query.mockReturnValue({ data: { enabled: false, businessCash: null } });
    render(<DailyBusinessBalance />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
  it('confirms exactly the displayed balance with a version and warns about released reservations', async () => {
    const user = userEvent.setup();
    render(<DailyBusinessBalance />);
    expect(screen.getByText(/₹218400.00 as your business balance/)).toBeInTheDocument();
    expect(screen.getByText(/Confirming clears payment reservations/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm balance' }));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.request.mock.calls[0];
    expect(url).toBe('/api/business-cash/reconcile');
    expect(JSON.parse(options.body)).toMatchObject({ currentBalance: 218400, expectedVersion: 7, idempotencyKey: expect.any(String) });
    expect(mocks.refresh).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Business balance confirmed');
  });
  it('shows a stale balance error and leaves a correction path available', async () => {
    mocks.request.mockRejectedValue(new Error('Your balance changed. Refresh before confirming it.'));
    const user = userEvent.setup();
    render(<DailyBusinessBalance />);
    await user.click(screen.getByRole('button', { name: 'Confirm balance' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your balance changed');
    expect(screen.getByRole('link', { name: 'Correct balance' })).toHaveAttribute('href', '/supplier-payments');
  });
});
