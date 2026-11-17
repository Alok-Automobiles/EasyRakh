import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceReportDialog } from '@/components/InvoiceReportDialog';
import { defaultInvoiceListState } from '@/lib/invoice-list-state';

vi.mock('@/components/InvoiceCustomerFilter', () => ({
  InvoiceCustomerFilter: ({ onChange }: { onChange: (value: string) => void }) => <button onClick={() => onChange('customer-1')}>Choose customer</button>,
}));

describe('invoice report filters', () => {
  it('exports a selected month and customer without changing the list filters', async () => {
    const download = vi.fn().mockResolvedValue(true);
    const filters = { ...defaultInvoiceListState, status: 'outstanding' as const, page: 3 };
    render(<InvoiceReportDialog filters={filters} downloading={false} onDownload={download} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download list PDF' }));
    fireEvent.change(screen.getByLabelText('Invoice month'), { target: { value: '2024-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Choose customer' }));
    await userEvent.click(screen.getByRole('button', { name: /^Download PDF$/ }));
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2024-02-01', endDate: '2024-02-29', customerId: 'customer-1', status: 'outstanding', page: 1 }));
    expect(filters.page).toBe(3);
    expect(filters.customerId).toBe('');
  });

  it('validates a custom date range and keeps failed downloads open', async () => {
    const download = vi.fn().mockResolvedValue(false);
    render(<InvoiceReportDialog filters={{ ...defaultInvoiceListState, startDate: '2026-10-01', endDate: '2026-10-15', addedToLedger: 'true' }} downloading={false} onDownload={download} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download list PDF' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('From invoice date'), { target: { value: '2026-10-20' } });
    expect(within(dialog).getByRole('button', { name: /^Download PDF$/ })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('To invoice date'), { target: { value: '2026-10-25' } });
    await userEvent.click(within(dialog).getByRole('button', { name: /^Download PDF$/ }));
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-10-20', endDate: '2026-10-25', addedToLedger: 'true' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
