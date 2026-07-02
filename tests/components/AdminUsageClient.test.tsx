import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const adminUser = {
  id: 'user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  createdAt: '2026-06-01T10:00:00.000Z',
  lastLoginAt: '2026-07-01T10:00:00.000Z',
  lastActiveAt: new Date().toISOString(),
  loginCount: 5,
};

const quietUser = {
  id: 'user-2',
  name: 'Quiet User',
  email: 'quiet@example.com',
  createdAt: '2026-05-01T10:00:00.000Z',
  lastLoginAt: null,
  lastActiveAt: null,
  loginCount: 0,
};

const pageTwoUser = {
  id: 'user-3',
  name: 'Page Two User',
  email: 'page-two@example.com',
  createdAt: '2026-04-01T10:00:00.000Z',
  lastLoginAt: null,
  lastActiveAt: null,
  loginCount: 1,
};

function buildUsagePayload(
  users = [adminUser, quietUser],
  pagination = {
    total: 12,
    totalUsers: 12,
    page: 1,
    pageSize: 10,
    totalPages: 2,
    hasNextPage: true,
    hasPreviousPage: false,
  }
) {
  return {
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
    pagination,
    users,
  };
}

function okJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe('AdminUsageClient', () => {
  beforeEach(() => {
    mocks.router.push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders metrics and filters the user table', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const page = parsed.searchParams.get('page');
      const status = parsed.searchParams.get('status');
      const search = parsed.searchParams.get('search');

      if (search === 'missing') {
        return okJson(
          buildUsagePayload([], {
            total: 0,
            totalUsers: 12,
            page: 1,
            pageSize: 10,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          })
        );
      }

      if (status === 'inactive') {
        return okJson(
          buildUsagePayload([quietUser], {
            total: 1,
            totalUsers: 12,
            page: 1,
            pageSize: 10,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          })
        );
      }

      if (page === '2') {
        return okJson(
          buildUsagePayload([pageTwoUser], {
            total: 12,
            totalUsers: 12,
            page: 2,
            pageSize: 10,
            totalPages: 2,
            hasNextPage: false,
            hasPreviousPage: true,
          })
        );
      }

      return okJson(buildUsagePayload());
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminUsageClient />);

    expect(await screen.findByText('User Activity Dashboard')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/usage?page=1&limit=10&status=all',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(screen.getByText('Active Last 24 Hours')).toBeInTheDocument();
    expect(screen.getByText('New Users Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('1-10 of 12 users shown')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByText('Admin User').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quiet User').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect((await screen.findAllByText('Page Two User')).length).toBeGreaterThan(0);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/usage?page=2&limit=10&status=all',
      expect.objectContaining({ cache: 'no-store' })
    );

    await user.click(screen.getByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
      expect(screen.queryByText('Page Two User')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Quiet User').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/usage?page=1&limit=10&status=inactive',
      expect.objectContaining({ cache: 'no-store' })
    );

    fireEvent.change(screen.getByPlaceholderText('Search users'), {
      target: { value: 'missing' },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/usage?page=1&limit=10&status=inactive&search=missing',
        expect.objectContaining({ cache: 'no-store' })
      );
    });
    expect(
      (await screen.findAllByText('No users match the current search or filter.')).length
    ).toBeGreaterThan(0);
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
