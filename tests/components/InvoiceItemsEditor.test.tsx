import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    buyingPrice: 450,
    uniqueCode: 'UC-104',
    brand: 'BOSCH',
    location: 'RACK A',
  },
  {
    id: '507f1f77bcf86cd799439017',
    itemNumber: 'BP-205',
    itemName: 'BRAKE PAD PREMIUM',
    quantity: 3,
    unitOfMeasure: 'PCS',
    buyingPrice: 700,
    uniqueCode: 'UC-205',
    brand: 'BREMBO',
    location: 'RACK B',
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
    expect(screen.getByText('Selling Price')).toBeInTheDocument();
    expect(screen.getByText('Cost Price')).toBeInTheDocument();
    expect(screen.getByText('Line Total')).toBeInTheDocument();

    for (const label of ['Row 1 quantity', 'Row 1 amount', 'Row 1 cost price']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('inputmode', 'numeric');
      expect(screen.getByLabelText(label)).toHaveAttribute('step', '1');
    }
  });

  it('rejects decimal entry in invoice quantity and price fields', () => {
    render(<EditorHarness />);

    for (const label of ['Row 1 quantity', 'Row 1 amount', 'Row 1 cost price']) {
      const input = screen.getByLabelText(label);
      expect(fireEvent.keyDown(input, { key: '.' })).toBe(false);
      expect(
        fireEvent.paste(input, {
          clipboardData: { getData: () => '12.5' },
        })
      ).toBe(false);
    }
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
      unitCost: 450,
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

  it('finds and links an inventory item by name when it has no part number', async () => {
    const blankNumberSuggestion = {
      id: '507f1f77bcf86cd799439018',
      itemNumber: '',
      itemName: 'BRAKE SHOE',
      quantity: 6,
      unitOfMeasure: 'PCS',
      buyingPrice: 300,
      uniqueCode: 'SHOE-01',
      brand: 'BOSCH',
      location: 'RACK B',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [blankNumberSuggestion] }),
      })
    );
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.type(screen.getByLabelText('Row 1 item name'), 'BRAKE SHOE');
    await screen.findByText('No part number');
    expect(screen.getByText('BOSCH • RACK B • SHOE-01')).toBeInTheDocument();
    await user.keyboard('{Enter}');

    expect(screen.getByLabelText('Row 1 part number')).toHaveValue('');
    expect(screen.getByLabelText('Row 1 item name')).toHaveValue('BRAKE SHOE');
    expect(screen.getByLabelText('Row 1 cost price')).toHaveValue(300);
    expect(screen.getByLabelText('Row 1 quantity')).toHaveFocus();
    expect(JSON.parse(screen.getByTestId('items-json').textContent || '[]')[0]).toMatchObject({
      inventoryItemId: blankNumberSuggestion.id,
      itemNumber: '',
      itemName: 'BRAKE SHOE',
      unitCost: 300,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('query=BRAKE+SHOE'),
      expect.any(Object)
    );
  });

  it('keeps the inventory link and part number when only the invoice name is edited', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialItems={[{
      id: '1',
      inventoryItemId: suggestions[0].id,
      itemNumber: suggestions[0].itemNumber,
      itemName: suggestions[0].itemName,
      quantity: 1,
      amount: 500,
      unitCost: 450,
      unitCostInput: '450',
    }]} />);

    const itemName = screen.getByLabelText('Row 1 item name');
    await user.clear(itemName);
    await user.type(itemName, 'FRONT BRAKE PAD');

    expect(JSON.parse(screen.getByTestId('items-json').textContent || '[]')[0]).toMatchObject({
      inventoryItemId: suggestions[0].id,
      itemNumber: 'BP-104',
      itemName: 'FRONT BRAKE PAD',
      unitCost: 450,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('can explicitly unlink a selected inventory item before choosing another one', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialItems={[{
      id: '1',
      inventoryItemId: suggestions[0].id,
      itemNumber: suggestions[0].itemNumber,
      itemName: suggestions[0].itemName,
      quantity: 1,
      amount: 500,
      unitCost: 450,
      unitCostInput: '450',
    }]} />);

    await user.click(screen.getByLabelText('Unlink row 1 inventory item'));

    const unlinked = JSON.parse(screen.getByTestId('items-json').textContent || '[]')[0];
    expect(unlinked.inventoryItemId).toBeUndefined();
    expect(unlinked.itemNumber).toBe('');
    expect(unlinked.itemName).toBe('BRAKE PAD');
    expect(unlinked.unitCost).toBeUndefined();
    await waitFor(() => {
      expect(screen.getByLabelText('Row 1 item name')).toHaveFocus();
    });
  });

  it('clears the inventory link when the part number itself is changed', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialItems={[{
      id: '1',
      inventoryItemId: suggestions[0].id,
      itemNumber: suggestions[0].itemNumber,
      itemName: suggestions[0].itemName,
      quantity: 1,
      amount: 500,
      unitCost: 450,
      unitCostInput: '450',
    }]} />);

    const partNumber = screen.getByLabelText('Row 1 part number');
    await user.clear(partNumber);
    await user.type(partNumber, 'NEW-1');

    const edited = JSON.parse(screen.getByTestId('items-json').textContent || '[]')[0];
    expect(edited.inventoryItemId).toBeUndefined();
    expect(edited.itemName).toBe('');
    expect(edited.unitCost).toBeUndefined();
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

  it('adds a new row from the last cost-price input using Enter', async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    await user.click(screen.getByLabelText('Row 1 cost price'));
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText('Row 2 part number')).toHaveFocus();
    });
  });

  it('warns when the cost price is greater than the selling price', async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialItems={[{
      id: '1',
      itemNumber: '',
      itemName: 'Below-cost item',
      quantity: 1,
      amount: 100,
      amountInput: '100',
      unitCost: 125,
      unitCostInput: '125',
    }]} />);

    expect(screen.getByTitle('Cost price is greater than selling price')).toHaveTextContent(
      '₹25 above sale'
    );
    expect(screen.getByLabelText('Row 1 amount')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Row 1 cost price')).toHaveAttribute('aria-invalid', 'true');

    const sellingPrice = screen.getByLabelText('Row 1 amount');
    await user.clear(sellingPrice);
    await user.type(sellingPrice, '150');

    expect(screen.queryByText(/above sale/)).not.toBeInTheDocument();
    expect(sellingPrice).not.toHaveAttribute('aria-invalid');
  });
});
