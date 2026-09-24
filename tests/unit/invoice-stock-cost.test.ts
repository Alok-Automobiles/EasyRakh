import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { normalizeInvoiceItemsForSave } from '@/lib/invoice-stock';

describe('Invoice-specific inventory cost', () => {
  it.each([
    ['id', 80, 50], ['number', 80, 50], ['id', 80, 0],
    ['number', undefined, 50], ['id', undefined, 50], ['id', 80, undefined],
  ] as const)('resolves by %s with inventory cost %s and entered cost %s', async (lookup, storedCost, enteredCost) => {
    const _id = new ObjectId();
    const inventory = { _id, itemNumber: 'PART-1', itemName: 'Part', buyingPrice: storedCost, quantity: 10 };
    const updateOne = vi.fn();
    const db = { collection: () => ({ find: () => ({ toArray: async () => [inventory] }), updateOne }) } as unknown as Db;
    const [item] = await normalizeInvoiceItemsForSave(db, 'user-1', [{
      inventoryItemId: lookup === 'id' ? _id.toString() : undefined,
      itemNumber: 'PART-1', itemName: 'Part', quantity: 2, unitPrice: 100, unitCost: enteredCost,
    }]);
    const cost = enteredCost ?? storedCost!;
    expect(item).toMatchObject({ inventoryItemId: _id.toString(), unitCost: cost, cogs: 2 * cost, grossProfit: 200 - 2 * cost });
    expect(updateOne).not.toHaveBeenCalled();
    expect(inventory.buyingPrice).toBe(storedCost);
  });
});
