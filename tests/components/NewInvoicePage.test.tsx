import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoiceDraftKey } from '@/lib/invoice-draft';
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
  default: ({ items, onChange }: { items: unknown[]; onChange: (items: unknown[]) => void }) => (
    <div><output aria-label="Draft items">{JSON.stringify(items)}</output>
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
    </button></div>
  ),
}));

describe('NewInvoicePage', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined);
    mocks.push.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps local customer suggestions when remote search fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url === '/api/customers?limit=20') {
        return Response.json({
          customers: [{ id: 'customer-1', name: 'Raj Traders', phone: '9876543210' }],
        });
      }
      if (url === '/api/bootstrap') {
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

      if (url === '/api/customers?limit=20') {
        return Response.json({ customers: [] });
      }
      if (url === '/api/bootstrap') {
        return Response.json({
          user: {
            id: 'user-1',
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
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['invoices'], refetchType: 'none' });
      expect(mocks.push).toHaveBeenCalledWith('/invoices/invoice-1');
    });

    expect(sessionStorage.getItem(invoiceDraftKey('user-1'))).toBeNull();
    expect(mocks.invalidateQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.push.mock.invocationCallOrder[0]
    );
  });
});


it('restores unfinished customer, item, and note inputs after leaving and returning, scoped to the account', async () => {
  sessionStorage.clear();
  let userId = 'draft-owner';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/bootstrap') return Response.json({ user: { id: userId } });
    if (url.startsWith('/api/customers')) return Response.json({ customers: [] });
    return Response.json({ nextInvoiceNumber: 'INV-1' });
  });
  const first = render(<NewInvoicePage />);
  fireEvent.change(await screen.findByLabelText('Customer Name *'), { target: { value: 'Draft Customer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add valid invoice item' }));
  const notes = screen.getByPlaceholderText(/notes/i);
  fireEvent.change(notes, { target: { value: 'Deliver tomorrow' } });
  await waitFor(() => expect(sessionStorage.getItem(invoiceDraftKey(userId))).toContain('Deliver tomorrow'));
  first.unmount();
  const second = render(<NewInvoicePage />);
  expect(await screen.findByLabelText('Customer Name *')).toHaveValue('Draft Customer');
  expect(screen.getByLabelText('Draft items')).toHaveTextContent('Brake Pad');
  expect(screen.getByLabelText('Draft items')).toHaveTextContent('600');
  expect(screen.getByPlaceholderText(/notes/i)).toHaveValue('Deliver tomorrow');
  second.unmount();
  userId = 'another-account';
  render(<NewInvoicePage />);
  expect(await screen.findByLabelText('Customer Name *')).toHaveValue('');
  expect(screen.getByLabelText('Draft items')).not.toHaveTextContent('Brake Pad');
  vi.restoreAllMocks();
});
