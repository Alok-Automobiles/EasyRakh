import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DailyCashRecordPage from '@/app/daily-cash-record/page';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

describe('DailyCashRecordPage entry dates', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.invalidateQueries.mockReset();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/daily-cash-records?page=1') {
        return Response.json({
          records: [
            {
              id: 'record-sept-5',
              date: '05-09-2026',
              totalIn: 5000,
              totalOut: 0,
              totalLeft: 5000,
              entryCount: 1,
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 1,
            recordsPerPage: 7,
          },
        });
      }

      if (url === '/api/daily-cash-records?date=05-09-2026') {
        return Response.json({
          record: {
            id: 'record-sept-5',
            date: '05-09-2026',
            totalIn: 5000,
            totalOut: 0,
            totalLeft: 5000,
            entries: [
              {
                id: 'entry-added-next-day',
                amount: 5000,
                type: 'in',
                description: 'Invoice payment received',
                source: 'invoice_payment',
                invoiceId: 'invoice-1',
                invoiceNumber: 'INV-2026-09-0041',
                createdAt: '2026-09-06T07:40:19.740Z',
                updatedAt: '2026-09-06T07:40:19.740Z',
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
  });

  it('shows the assigned cash date instead of the entry creation date', async () => {
    const user = userEvent.setup();
    render(<DailyCashRecordPage />);

    const recordButton = await screen.findByRole('button', {
      name: /05-09-2026 1 entry/i,
    });
    await user.click(recordButton);

    const dialog = await screen.findByRole('dialog', { name: '05-09-2026' });
    expect(within(dialog).getByRole('columnheader', { name: 'Cash Date' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('05-09-2026')).toHaveLength(3);
    expect(within(dialog).queryByText('06-09-2026')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/daily-cash-records?date=05-09-2026'
      );
    });
  });
});
