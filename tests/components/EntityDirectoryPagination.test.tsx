import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomersPage from '@/app/customers/page';
import SuppliersPage from '@/app/suppliers/page';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  invalidateQueries: vi.fn(),
  queryOptions: vi.fn(),
  collapseAfterPageOne: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: [string, string, string, number] }) => {
    mocks.queryOptions(options);
    const [entityKind, , search, page] = options.queryKey;
    const totalPages = mocks.collapseAfterPageOne && page === 2 ? 1 : 2;
    const record = {
      id: `${entityKind}-${page}`,
      userId: 'user-1',
      name: `${entityKind} page ${page}`,
      openingBalance: 0,
      balanceType: 'debit',
      totalBalance: 250,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    };

    return {
      data: {
        [entityKind]: [record],
        pagination: {
          total: search ? 3 : 42,
          page,
          pageSize: 20,
          totalPages,
        },
        summary: { total: 42, receivable: 12500, payable: 3200 },
      },
      isLoading: false,
      isFetching: false,
    };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/components/EntityCard', () => ({
  default: ({ entity }: { entity: { name: string } }) => <div>{entity.name}</div>,
}));

vi.mock('@/components/EntityDirectoryHeader', () => ({
  default: ({
    count,
    receivable,
    payable,
    resultCount,
    searchQuery,
    searchPlaceholder,
    onSearchChange,
  }: {
    count: number;
    receivable: number;
    payable: number;
    resultCount?: number;
    searchQuery: string;
    searchPlaceholder: string;
    onSearchChange: (value: string) => void;
  }) => (
    <div>
      <span>directory total {count}</span>
      <span>receivable {receivable}</span>
      <span>payable {payable}</span>
      <span>result total {resultCount ?? 'none'}</span>
      <input
        aria-label={searchPlaceholder}
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </div>
  ),
}));

const cases = [
  {
    label: 'customers',
    Component: CustomersPage,
    searchLabel: 'Search customers by name, phone, email or address',
    apiPath: '/api/customers',
  },
  {
    label: 'suppliers',
    Component: SuppliersPage,
    searchLabel: 'Search suppliers by name, phone, email or address',
    apiPath: '/api/suppliers',
  },
] as const;

describe('customer and supplier directory pagination', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.queryOptions.mockReset();
    mocks.collapseAfterPageOne = false;
    vi.restoreAllMocks();
  });

  it.each(cases)('requests pages and resets $label search to page one', async ({
    label,
    Component,
    searchLabel,
    apiPath,
  }) => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
    render(<Component />);

    expect(screen.getByText('directory total 42')).toBeInTheDocument();
    expect(screen.getByText('receivable 12500')).toBeInTheDocument();
    expect(screen.getByText('payable 3200')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    const pageTwoOptions = mocks.queryOptions.mock.calls.at(-1)?.[0];
    expect(pageTwoOptions.queryKey).toEqual([label, 'directory', '', 2]);
    await act(async () => pageTwoOptions.queryFn());
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiPath}?page=2&limit=20`);

    fireEvent.change(screen.getByRole('textbox', { name: searchLabel }), {
      target: { value: 'R' },
    });
    const searchOptions = mocks.queryOptions.mock.calls.at(-1)?.[0];
    expect(searchOptions.queryKey).toEqual([label, 'directory', 'r', 1]);
    expect(screen.getByText('result total 3')).toBeInTheDocument();
    await act(async () => searchOptions.queryFn());
    expect(fetchMock).toHaveBeenLastCalledWith(`${apiPath}?page=1&limit=20&search=R`);
  });

  it.each(cases)('recovers $label when the current page becomes invalid', async ({
    label,
    Component,
  }) => {
    mocks.collapseAfterPageOne = true;
    const user = userEvent.setup();
    render(<Component />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => {
      const queryKeys = mocks.queryOptions.mock.calls.map(([options]) => options.queryKey);
      expect(queryKeys).toContainEqual([label, 'directory', '', 2]);
      expect(queryKeys.at(-1)).toEqual([label, 'directory', '', 1]);
    });
  });
});
