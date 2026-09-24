import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import InvoiceDetailPage from '@/app/invoices/[id]/page';

const mocks = vi.hoisted(() => ({ router: { push: vi.fn(), back: vi.fn() }, refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useParams: () => ({ id: 'invoice-1' }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/hooks/useSupplierPayments', () => ({ useRefreshSupplierPayments: () => mocks.refresh }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

it.each([50, 100])('refreshes inactive invoice lists when a payment changes the amount to %i', async (amount) => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  let invoice = { id: 'invoice-1', invoiceNumber: 'INV-1', customerName: 'Test customer', totalAmount: 100, paidAmount: 0, status: 'unpaid', items: [], createdAt: '2026-09-01', payments: [] };
  const listKey = ['invoices', '', 'all', 1];
  const listRequest = vi.fn(async () => ({ invoices: [invoice] }));
  await client.fetchQuery({ queryKey: listKey, queryFn: listRequest });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      invoice = { ...invoice, paidAmount: amount, status: amount === 100 ? 'paid' : 'partial' };
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => url === '/api/auth/me' ? { user: {} } : { invoice } };
  }));
  render(<QueryClientProvider client={client}><InvoiceDetailPage /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Add Payment' }));
  fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: String(amount) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Payment' }));
  await waitFor(() => expect(client.getQueryData(listKey)).toMatchObject({ invoices: [{ paidAmount: amount, status: amount === 100 ? 'paid' : 'partial' }] }));
  expect(listRequest).toHaveBeenCalledTimes(2);
  client.clear();
});
