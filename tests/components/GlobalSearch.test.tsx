import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalSearch from '@/components/GlobalSearch';
import { ids } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  results: [] as Array<{
    id: string;
    name: string;
    type: 'customer' | 'supplier' | 'custom_entity' | 'invoice';
    subtitle?: string;
    badge?: string;
    href: string;
  }>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: [string, string] }) => {
    const query = queryKey[1];
    return {
      data: query.length >= 2 ? { results: mocks.results } : undefined,
      isLoading: false,
      isFetching: false,
    };
  },
}));

describe('GlobalSearch', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.results = [];
    localStorage.clear();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('loads recent searches on focus and lets users re-run one', async () => {
    const user = userEvent.setup();
    localStorage.setItem('global-search-recent', JSON.stringify(['brake pad', 'raj']));

    render(<GlobalSearch />);
    const input = screen.getByPlaceholderText('Search customers, suppliers, invoices...');

    await user.click(input);

    expect(screen.getByText('Recent Searches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /brake pad/i }));

    expect(input).toHaveValue('brake pad');
  });

  it('groups results, supports keyboard open, navigates, and stores the submitted search', async () => {
    const user = userEvent.setup();
    mocks.results = [
      {
        id: ids.customer,
        name: 'Raj Traders',
        type: 'customer',
        subtitle: '9876543210',
        badge: 'Customer',
        href: `/ledger/customer/${ids.customer}`,
      },
      {
        id: 'invoice-1',
        name: 'INV-001',
        type: 'invoice',
        subtitle: 'Raj Traders — ₹4,500',
        badge: 'Partial',
        href: '/invoices/invoice-1',
      },
    ];

    render(<GlobalSearch />);
    const input = screen.getByPlaceholderText('Search customers, suppliers, invoices...');

    await user.type(input, 'raj');

    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /9876543210/ })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(mocks.push).toHaveBeenCalledWith(`/ledger/customer/${ids.customer}`);
    expect(JSON.parse(localStorage.getItem('global-search-recent') || '[]')).toEqual(['raj']);
    expect(input).toHaveValue('');
  });
});
