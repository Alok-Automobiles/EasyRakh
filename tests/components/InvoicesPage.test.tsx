import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoicesPage from '@/app/invoices/page';
import { ids } from '@/tests/helpers/api';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
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
  }),
  useMutation: () => ({
    mutate: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

describe('InvoicesPage invoice downloads', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.invalidateQueries.mockReset();
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
});
