import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoicesPage from '@/app/invoices/page';
import { ids } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  invalidateQueries: vi.fn(),
  queryOptions: vi.fn(),
  queryData: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@/components/InvoiceCustomerFilter', () => ({
  InvoiceCustomerFilter: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(value ? '' : ids.customer)}>
      Customer: {value || 'All customers'}
    </button>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    mocks.queryOptions(options);
    return {
      data: mocks.queryData ?? {
        invoices: [{
          id: ids.transaction,
          userId: ids.user,
          invoiceNumber: 'INV-2026-07-0001',
          customerName: 'Raj Traders',
          items: [],
          totalAmount: 900,
          paidAmount: 0,
          status: 'unpaid',
          addedToLedger: false,
          createdAt: new Date('2026-07-25T10:00:00.000Z'),
          updatedAt: new Date('2026-07-25T10:00:00.000Z'),
        }],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      },
      isLoading: false,
    };
  },
  useMutation: () => ({
    mutate: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

describe('InvoicesPage invoice downloads', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/invoices');
    mocks.push.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.queryOptions.mockReset();
    mocks.queryData = null;
  });

  it('waits for two characters and debounces invoice searches', () => {
    vi.useFakeTimers();
    render(<InvoicesPage />);

    const searchInput = screen.getByRole('textbox', { name: 'Search invoices' });
    fireEvent.change(searchInput, { target: { value: 'R' } });

    act(() => vi.advanceTimersByTime(350));
    expect(mocks.queryOptions.mock.calls.at(-1)?.[0]).toMatchObject({
      queryKey: ['invoices', ''],
    });

    fireEvent.change(searchInput, { target: { value: 'Ra' } });
    act(() => vi.advanceTimersByTime(349));
    expect(mocks.queryOptions.mock.calls.at(-1)?.[0]).toMatchObject({
      queryKey: ['invoices', ''],
    });

    act(() => vi.advanceTimersByTime(1));
    expect(mocks.queryOptions.mock.calls.at(-1)?.[0]).toMatchObject({
      queryKey: ['invoices', 'search=Ra'],
    });
    vi.useRealTimers();
  });

  it('downloads the PDF without opening the invoice page', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['%PDF-1.7 invoice'], { type: 'application/pdf' }), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      })
    );
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<InvoicesPage />);
    await user.click(screen.getByRole('button', { name: 'Download invoice INV-2026-07-0001' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/invoices/${ids.transaction}/download`);
      expect(anchorClick).toHaveBeenCalledOnce();
    });
    expect(mocks.push).not.toHaveBeenCalledWith(`/invoices/${ids.transaction}`);
  });

  it('opens the firm-details flow only when the API says details are missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          error: 'Complete your firm details before downloading this invoice.',
          code: 'FIRM_DETAILS_REQUIRED',
        },
        { status: 409 }
      )
    );

    render(<InvoicesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Download invoice INV-2026-07-0001' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/invoices/${ids.transaction}/download`);
      expect(mocks.push).toHaveBeenCalledWith(
        `/invoices/${ids.transaction}?download=true`
      );
    });
  });

  it('restores the search, filters, sorting, and page from the URL', () => {
    window.history.replaceState(null, '', `/invoices?search=Raj&status=partial&startDate=2026-07-01&endDate=2026-07-31&customerId=${ids.customer}&minAmount=100&maxAmount=900&addedToLedger=false&sort=amount-desc&page=2`);
    render(<InvoicesPage />);

    expect(screen.getByRole('textbox', { name: 'Search invoices' })).toHaveValue('Raj');
    expect(screen.getByRole('combobox', { name: 'Payment status' })).toHaveTextContent('Partial');
    expect(screen.getByRole('combobox', { name: 'Sort invoices' })).toHaveTextContent('Amount: highest');
    expect(screen.getByRole('button', { name: 'More filters (3)' })).toBeInTheDocument();
    expect(mocks.queryOptions.mock.calls.at(-1)?.[0]).toMatchObject({
      queryKey: ['invoices', expect.stringContaining('page=2')],
    });
  });

  it('applies the customer and total filters, then clears them without losing the toolbar', () => {
    vi.useFakeTimers();
    render(<InvoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    fireEvent.change(screen.getByLabelText('Minimum total (₹)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Maximum total (₹)'), { target: { value: '900' } });
    act(() => vi.advanceTimersByTime(350));

    expect(new URLSearchParams(window.location.search).get('customerId')).toBe(ids.customer);
    expect(new URLSearchParams(window.location.search).get('minAmount')).toBe('100');
    expect(new URLSearchParams(window.location.search).get('maxAmount')).toBe('900');
    expect(screen.getByRole('button', { name: 'More filters (2)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(window.location.pathname + window.location.search).toBe('/invoices');
    expect(screen.getByRole('textbox', { name: 'Search invoices' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('separates no matching invoices from an empty account', () => {
    mocks.queryData = { invoices: [], pagination: { total: 0, page: 1, pageSize: 20, totalPages: 1 } };
    window.history.replaceState(null, '', '/invoices?status=unpaid');
    const { unmount } = render(<InvoicesPage />);
    expect(screen.getByRole('heading', { name: 'No matching invoices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
    unmount();
    window.history.replaceState(null, '', '/invoices');
    render(<InvoicesPage />);
    expect(screen.getByRole('heading', { name: 'No invoices yet' })).toBeInTheDocument();
  });

  it('carries a filtered return URL into the invoice detail and share links', () => {
    window.history.replaceState(null, '', '/invoices?status=paid&sort=date-desc&page=3');
    render(<InvoicesPage />);

    const expectedReturn = '/invoices?status=paid&sort=date-desc&page=3';
    const expectedDetail = `/invoices/${ids.transaction}?returnTo=${encodeURIComponent(expectedReturn)}`;
    fireEvent.click(screen.getByRole('button', { name: 'Open invoice INV-2026-07-0001' }));
    expect(mocks.push).toHaveBeenCalledWith(expectedDetail);
    expect(screen.getByRole('link', { name: 'Share invoice INV-2026-07-0001' })).toHaveAttribute('href', `${expectedDetail}&share=true`);
  });
});
