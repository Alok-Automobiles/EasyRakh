import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NewInvoicePage from '@/app/invoices/new/page';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  push: vi.fn(),
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
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock('@/components/InvoiceItemsEditor', () => ({
  createEmptyInvoiceItem: (id = '1') => ({
    id,
    itemNumber: '',
    itemName: '',
    quantity: 0,
    quantityInput: '',
    amount: 0,
    amountInput: '',
    unitCost: undefined,
    unitCostInput: '',
  }),
  default: ({ onChange }: { onChange: (items: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() => onChange([{
        id: '1',
        itemNumber: 'ITEM-1',
        itemName: 'Brake Pad',
        quantity: 1,
        amount: 900,
        unitCost: 600,
      }])}
    >
      Add valid invoice item
    </button>
  ),
}));

describe('NewInvoicePage', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined);
    mocks.push.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps local customer suggestions when remote search fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url === '/api/customers') {
        return Response.json({
          customers: [{ id: 'customer-1', name: 'Raj Traders', phone: '9876543210' }],
        });
      }
      if (url === '/api/auth/me') {
        return Response.json({ user: {} });
      }
      if (url.startsWith('/api/invoices/next-number')) {
        return Response.json({ nextInvoiceNumber: 'INV-2026-08-0001' });
      }
      if (url === '/api/customers?search=Raj') {
        return new Response(null, { status: 503 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<NewInvoicePage />);

    const input = await screen.findByLabelText('Customer Name *');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Raj' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/customers?search=Raj',
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });
    expect(screen.getByText('Raj Traders')).toBeInTheDocument();
  });

  it('invalidates the invoice list before navigating to the created invoice', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === '/api/customers') {
        return Response.json({ customers: [] });
      }
      if (url === '/api/auth/me') {
        return Response.json({
          user: {
            firmTitle: 'EasyRakh Test',
            gstNumber: '07ABCDE1234F1Z5',
            firmPhone: '9999999999',
            firmEmail: 'test@example.com',
            firmAddress: 'Delhi',
          },
        });
      }
      if (url.startsWith('/api/invoices/next-number')) {
        return Response.json({ nextInvoiceNumber: 'INV-2026-08-0001' });
      }
      if (url === '/api/invoices' && init?.method === 'POST') {
        return Response.json({ invoice: { id: 'invoice-1' } }, { status: 201 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<NewInvoicePage />);

    await screen.findByRole('heading', { name: 'Create Invoice' });
    fireEvent.change(screen.getByLabelText('Customer Name *'), {
      target: { value: 'Raj Traders' },
    });
    await user.click(screen.getByRole('button', { name: 'Add valid invoice item' }));
    await user.click(screen.getByRole('button', { name: 'Create Invoice' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/invoices',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['invoices'] });
      expect(mocks.push).toHaveBeenCalledWith('/invoices/invoice-1');
    });

    expect(mocks.invalidateQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.push.mock.invocationCallOrder[0]
    );
  });
});
