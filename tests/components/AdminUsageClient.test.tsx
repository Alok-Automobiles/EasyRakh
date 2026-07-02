import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsageClient from '@/app/admin/usage/AdminUsageClient';

const mocks = vi.hoisted(() => ({
  router: {
    push: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

const usagePayload = {
  totalUsers: 2,
  activeLast24Hours: 1,
  activeLast7Days: 1,
  activeLast30Days: 1,
  newUsersLast7Days: 1,
  inactive30PlusDays: 1,
  activeRateLast7Days: 50,
  activeRateLast30Days: 50,
  stickinessRate: 100,
  averageLoginCount: 2.5,
  generatedAt: '2026-07-02T03:45:00.000Z',
  users: [
    {
      id: 'user-1',
      name: 'Admin User',
      email: 'admin@example.com',
      createdAt: '2026-06-01T10:00:00.000Z',
      lastLoginAt: '2026-07-01T10:00:00.000Z',
      lastActiveAt: new Date().toISOString(),
      loginCount: 5,
    },
    {
      id: 'user-2',
      name: 'Quiet User',
      email: 'quiet@example.com',
      createdAt: '2026-05-01T10:00:00.000Z',
      lastLoginAt: null,
      lastActiveAt: null,
      loginCount: 0,
    },
  ],
};

describe('AdminUsageClient', () => {
  beforeEach(() => {
    mocks.router.push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders metrics and filters the user table', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => usagePayload,
      })
    );

    render(<AdminUsageClient />);

    expect(await screen.findByText('User Activity Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Active Last 24 Hours')).toBeInTheDocument();
    expect(screen.getByText('New Users Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Quiet User')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Inactive' }));

    expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
    expect(screen.getByText('Quiet User')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search users'), {
      target: { value: 'missing' },
    });

    expect(await screen.findByText('No users match the current search or filter.')).toBeInTheDocument();
  });

  it('shows an access denied state for non-admin users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      })
    );

    render(<AdminUsageClient />);

    expect(await screen.findByText('Admin access required')).toBeInTheDocument();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
