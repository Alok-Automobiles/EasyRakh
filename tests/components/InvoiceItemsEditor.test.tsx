import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceItemsEditor, {
  createEmptyInvoiceItem,
} from '@/components/InvoiceItemsEditor';
import type { EditableInvoiceItem } from '@/components/InvoiceItemsEditor';

const suggestions = [
  {
    id: '507f1f77bcf86cd799439016',
    itemNumber: 'BP-104',
    itemName: 'BRAKE PAD',
    quantity: 8,
    unitOfMeasure: 'PCS',
  },
  {
    id: '507f1f77bcf86cd799439017',
    itemNumber: 'BP-205',
    itemName: 'BRAKE PAD PREMIUM',
    quantity: 3,
    unitOfMeasure: 'PCS',
  },
];

function EditorHarness({ initialItems }: { initialItems?: EditableInvoiceItem[] }) {
  const [items, setItems] = useState<EditableInvoiceItem[]>(
    initialItems || [createEmptyInvoiceItem('1')]
  );

  return (
    <>
      <InvoiceItemsEditor items={items} onChange={setItems} suggestionDelayMs={0} />
      <output data-testid="items-json">{JSON.stringify(items)}</output>
    </>
  );
}

describe('InvoiceItemsEditor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: suggestions }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the invoice item columns', () => {
    render(<EditorHarness />);

    expect(screen.getByText('S.No')).toBeInTheDocument();
    expect(screen.getByText('Part Number')).toBeInTheDocument();
    expect(screen.getByText('Item Name')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('autofills item name by selecting an inventory suggestion with the keyboard', async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.type(screen.getByLabelText('Row 1 part number'), 'BP');
    await screen.findByText('BP-104');
    await user.keyboard('{Enter}');

    expect(screen.getByLabelText('Row 1 item name')).toHaveValue('BRAKE PAD');
    expect(screen.getByLabelText('Row 1 quantity')).toHaveFocus();
    expect(JSON.parse(screen.getByTestId('items-json').textContent || '[]')[0]).toMatchObject({
      inventoryItemId: '507f1f77bcf86cd799439016',
      itemNumber: 'BP-104',
      itemName: 'BRAKE PAD',
    });
  });

  it('supports arrow-key navigation inside suggestions', async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.type(screen.getByLabelText('Row 1 part number'), 'BP');
    await screen.findByText('BP-205');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByLabelText('Row 1 item name')).toHaveValue('BRAKE PAD PREMIUM');
  });

  it('moves through inputs with Enter and back with Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const partNumber = screen.getByLabelText('Row 1 part number');
    await user.click(partNumber);
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Row 1 item name')).toHaveFocus();

    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(partNumber).toHaveFocus();
  });

  it('adds a new row from the last amount input using Enter', async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.click(screen.getByLabelText('Row 1 amount'));
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText('Row 2 part number')).toHaveFocus();
    });
  });
});
