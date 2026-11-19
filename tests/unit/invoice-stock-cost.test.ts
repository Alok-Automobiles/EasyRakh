import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { applyInventoryAdjustments, getInventoryDiffAdjustments, normalizeInvoiceItemsForSave } from '@/lib/invoice-stock';
import type { InvoiceItem } from '@/lib/types';

describe('Invoice-specific inventory cost', () => {
  const historicalItem: InvoiceItem = {
    id: 'saved-line', inventoryItemId: new ObjectId().toString(),
    itemNumber: 'OLD', itemName: 'Historical part', quantity: 1,
    unitPrice: 100, amount: 100, lineTotal: 100, unitCost: 60,
    cogs: 60, grossProfit: 40, costStatus: 'complete', costSource: 'inventory_snapshot',
  };
  const emptyInventoryDb = () => ({
    collection: () => ({ find: () => ({ toArray: async () => [] }) }),
  }) as unknown as Db;

  it('preserves a missing historical link and its profit snapshot when adding a manual item', async () => {
    const withoutLineId = { ...historicalItem, id: undefined };
    const result = await normalizeInvoiceItemsForSave(emptyInventoryDb(), 'user-1', [
      { itemName: 'Labour', quantity: 1, unitPrice: 20, unitCost: 0 },
      withoutLineId,
    ], undefined, [historicalItem]);
    expect(result[1]).toEqual(historicalItem);
    expect(getInventoryDiffAdjustments([historicalItem], result)).toEqual([]);
  });

  it('deducts only the new inventory selection when an old linked record is missing', async () => {
    const newInventoryId = new ObjectId();
    const db = { collection: () => ({ find: () => ({ toArray: async () => [{
      _id: newInventoryId, itemName: 'New part', itemNumber: 'NEW', quantity: 1, buyingPrice: 20,
    }] }) }) } as unknown as Db;
    const result = await normalizeInvoiceItemsForSave(db, 'user-1', [historicalItem, {
      inventoryItemId: newInventoryId.toString(), itemName: 'New part', itemNumber: 'NEW',
      quantity: 1, unitPrice: 30,
    }], undefined, [historicalItem]);
    expect(result[0]).toEqual(historicalItem);
    expect(getInventoryDiffAdjustments([historicalItem], result)).toEqual([
      { inventoryItemId: newInventoryId.toString(), quantityDelta: -1 },
    ]);
  });

  it('does not reuse one historical line to accept a duplicate missing inventory selection', async () => {
    await expect(normalizeInvoiceItemsForSave(emptyInventoryDb(), 'user-1', [
      historicalItem, historicalItem,
    ], undefined, [historicalItem])).rejects.toMatchObject({ code: 'INVENTORY_ITEM_NOT_FOUND' });
  });

  it.each(['quantity', 'unitCost', 'unitPrice', 'itemName'] as const)(
    'still validates missing inventory when historical %s changes', async (field) => {
      const changed = { ...historicalItem, [field]: field === 'itemName' ? 'Edited part' : 2 };
      await expect(normalizeInvoiceItemsForSave(emptyInventoryDb(), 'user-1', [changed], undefined,
        [historicalItem])).rejects.toMatchObject({ code: 'INVENTORY_ITEM_NOT_FOUND' });
    }
  );

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

describe('Historical invoice stock restorations', () => {
  it.each([1, 4])('skips restoring %s units to a missing product and restores other products', async (quantityDelta) => {
    const missingId = new ObjectId().toString();
    const existingId = new ObjectId().toString();
    const findOneAndUpdate = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: new ObjectId(existingId), itemName: 'Existing part', quantity: 5,
    });
    const findOne = vi.fn().mockResolvedValue(null);
    const updateOne = vi.fn();
    const db = { collection: () => ({ findOneAndUpdate, findOne, updateOne }) } as unknown as Db;
    const changed = await applyInventoryAdjustments(db, 'user-1', [
      { inventoryItemId: missingId, quantityDelta },
      { inventoryItemId: existingId, quantityDelta: 2 },
    ], undefined, { skipMissingRestorations: true });
    expect(changed).toEqual([existingId]);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({ _id: new ObjectId(missingId), userId: 'user-1' }, expect.anything());
    expect(findOneAndUpdate.mock.calls.every((call) => !call[2].upsert)).toBe(true);
  });

  it.each([
    [-1, true], [1, false],
  ])('still rejects missing stock for delta %s with skip enabled %s', async (quantityDelta, skipMissingRestorations) => {
    const db = { collection: () => ({
      findOneAndUpdate: vi.fn().mockResolvedValue(null), findOne: vi.fn().mockResolvedValue(null),
    }) } as unknown as Db;
    await expect(applyInventoryAdjustments(db, 'user-1', [{
      inventoryItemId: new ObjectId().toString(), quantityDelta,
    }], undefined, { skipMissingRestorations })).rejects.toMatchObject({ code: 'INVENTORY_ITEM_NOT_FOUND' });
  });
});
