import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCustomerFilter } from '@/components/InvoiceCustomerFilter';

const raj = { id: 'customer-raj', name: 'Raj Traders', phone: '9876543210' };
const maya = { id: 'customer-maya', name: 'Maya Store' };
const clients: QueryClient[] = [];

function page(customers = [raj], currentPage = 1, totalPages = 1) {
  return { customers, pagination: { page: currentPage, totalPages } };
}

function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

function renderPicker(initialValue = '') {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);

  function Picker() {
    const [value, setValue] = useState(initialValue);
    return <InvoiceCustomerFilter value={value} onChange={(id) => { onChange(id); setValue(id); }} />;
  }

  render(<QueryClientProvider client={client}><Picker /></QueryClientProvider>);
  return { onChange };
}

describe('InvoiceCustomerFilter', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    vi.unstubAllGlobals();
  });

  it('does not request customer pages until the picker is open', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response(page()));
    vi.stubGlobal('fetch', fetchMock);
    renderPicker();

    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    expect(await screen.findByRole('option', { name: /Raj Traders/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/customers?search=&page=1&limit=20', { signal: expect.any(AbortSignal) });
  });

  it('loads additional pages and selects an exact customer without a redundant detail request', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response(page([raj], 1, 2)))
      .mockImplementationOnce(() => response(page([{ ...maya, phone: '' }], 2, 2)));
    vi.stubGlobal('fetch', fetchMock);
    const { onChange } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load more customers' }));

    expect(await screen.findByRole('option', { name: 'Maya Store' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Raj Traders/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/customers?search=&page=2&limit=20', { signal: expect.any(AbortSignal) });
    await userEvent.click(screen.getByRole('option', { name: 'Maya Store' }));

    expect(onChange).toHaveBeenCalledWith(maya.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customer: Maya Store' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves a restored customer ID and displays their name and phone while closed', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response({ customer: raj }));
    vi.stubGlobal('fetch', fetchMock);
    const { onChange } = renderPicker(raj.id);

    expect(await screen.findByRole('button', { name: 'Customer: Raj Traders · 9876543210' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/customers/customer-raj', { signal: expect.any(AbortSignal) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a missing restored selection and lets the user clear it', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ error: 'Customer not found' }, 404))
      .mockImplementationOnce(() => response(page([])));
    vi.stubGlobal('fetch', fetchMock);
    const { onChange } = renderPicker('missing-customer');

    await userEvent.click(await screen.findByRole('button', { name: 'Customer: Selected customer unavailable' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('option', { name: 'All customers' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByRole('button', { name: 'Customer: All customers' })).toBeInTheDocument();
  });

  it('requires two characters and debounces name or phone searches before resetting pagination', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response(page()));
    vi.stubGlobal('fetch', fetchMock);
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    await screen.findByRole('option', { name: /Raj Traders/ });
    const input = screen.getByRole('combobox', { name: 'Search customers by name or phone' });

    fireEvent.change(input, { target: { value: '9' } });
    expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 330)); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: '987' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('option', { name: /Raj Traders/ })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/customers?search=987&page=1&limit=20', { signal: expect.any(AbortSignal) }));
    expect(await screen.findByRole('option', { name: /Raj Traders/ })).toBeInTheDocument();
  });

  it('aborts an obsolete search and keeps the latest search results', async () => {
    let obsoleteSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation((url: string, options: RequestInit) => {
      if (url.includes('search=ra&')) {
        obsoleteSignal = options.signal as AbortSignal;
        return new Promise(() => {});
      }
      return response(page(url.includes('search=ma&') ? [{ ...maya, phone: '' }] : [raj]));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    const input = screen.getByRole('combobox', { name: 'Search customers by name or phone' });
    fireEvent.change(input, { target: { value: 'ra' } });
    await waitFor(() => expect(obsoleteSignal).toBeDefined());
    fireEvent.change(input, { target: { value: 'ma' } });

    expect(await screen.findByRole('option', { name: 'Maya Store' })).toBeInTheDocument();
    expect(obsoleteSignal?.aborted).toBe(true);
    expect(screen.queryByRole('option', { name: /Raj Traders/ })).not.toBeInTheDocument();
  });

  it('supports arrow-key selection and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => response(page())));
    const { onChange } = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    await screen.findByRole('option', { name: /Raj Traders/ });
    await user.click(screen.getByRole('combobox', { name: 'Search customers by name or phone' }));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith(raj.id);
    await waitFor(() => expect(screen.getByRole('button', { name: /Customer: Raj Traders/ })).toHaveFocus());
  });

  it('aborts the active customer-page request when the dialog closes', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Promise(() => {});
    }));
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
  });

  it('shows request errors and retries without losing the picker controls', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ error: 'Unavailable' }, 503))
      .mockImplementationOnce(() => response(page()));
    vi.stubGlobal('fetch', fetchMock);
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: 'Customer: All customers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load customers.');
    expect(screen.getByRole('combobox', { name: 'Search customers by name or phone' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('option', { name: /Raj Traders/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
