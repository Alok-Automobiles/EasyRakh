import { ClientSession, Db, ObjectId } from 'mongodb';
import type { InventoryItem, InvoiceItem } from '@/lib/types';
import { normalizeIdentifier } from './search-normalization';
import { inventoryDerivedFields } from './read-models';

export type InvoiceItemInput = {
  inventoryItemId?: string;
  itemNumber?: string;
  itemName: string;
  quantity: number;
  amount: number;
};

export type InventoryAdjustment = {
  inventoryItemId: string;
  quantityDelta: number;
};

export class InvoiceStockError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'InvoiceStockError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type InventorySnapshot = Pick<InventoryItem, 'itemName' | 'itemNumber' | 'quantity'> & {
  _id: ObjectId;
  userId: string;
  lastQuantityUpdatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

function normalizeItemNumber(value?: string) {
  return value?.trim() || '';
}

function normalizeItemName(value: string) {
  return value.trim();
}

function assertValidInventoryId(id: string) {
  if (!ObjectId.isValid(id)) {
    throw new InvoiceStockError(
      'INVALID_INVENTORY_ITEM',
      'Selected inventory item is invalid',
      400
    );
  }
}

export function getLinkedInventoryQuantities(items: InvoiceItem[]): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const item of items) {
    if (!item.inventoryItemId) continue;
    quantities.set(
      item.inventoryItemId,
      (quantities.get(item.inventoryItemId) || 0) + item.quantity
    );
  }

  return quantities;
}

export function getInventoryDiffAdjustments(
  previousItems: InvoiceItem[],
  nextItems: InvoiceItem[]
): InventoryAdjustment[] {
  const previous = getLinkedInventoryQuantities(previousItems);
  const next = getLinkedInventoryQuantities(nextItems);
  const ids = new Set([...previous.keys(), ...next.keys()]);

  return Array.from(ids)
    .map((inventoryItemId) => ({
      inventoryItemId,
      quantityDelta: (previous.get(inventoryItemId) || 0) - (next.get(inventoryItemId) || 0),
    }))
    .filter((adjustment) => adjustment.quantityDelta !== 0);
}

export function getInventoryRestoreAdjustments(items: InvoiceItem[]): InventoryAdjustment[] {
  return Array.from(getLinkedInventoryQuantities(items)).map(([inventoryItemId, quantityDelta]) => ({
    inventoryItemId,
    quantityDelta,
  }));
}

async function getInventoryLookups(
  db: Db,
  userId: string,
  items: InvoiceItemInput[],
  session?: ClientSession
) {
  const inventoryCollection = db.collection<InventorySnapshot>('inventory');
  const ids = new Set<string>();
  const itemNumbers = new Set<string>();

  for (const item of items) {
    if (item.inventoryItemId) {
      assertValidInventoryId(item.inventoryItemId);
      ids.add(item.inventoryItemId);
      continue;
    }

    const itemNumber = normalizeItemNumber(item.itemNumber);
    if (itemNumber) {
      itemNumbers.add(normalizeIdentifier(itemNumber));
    }
  }

  const projection = { _id: 1, itemName: 1, itemNumber: 1, quantity: 1, createdAt: 1, updatedAt: 1, lastQuantityUpdatedAt: 1 };
  const [itemsById, itemsByNumber] = await Promise.all([
    ids.size > 0
      ? inventoryCollection
          .find(
            {
              _id: { $in: Array.from(ids, (id) => new ObjectId(id)) },
              userId,
            },
            { projection, session }
          )
          .toArray()
      : Promise.resolve([]),
    itemNumbers.size > 0
      ? inventoryCollection
          .find(
            {
              userId,
              itemNumberKey: { $in: Array.from(itemNumbers) },
            },
            { projection, session }
          )
          .toArray()
      : Promise.resolve([]),
  ]);

  return {
    byId: new Map(itemsById.map((item) => [item._id.toString(), item])),
    byNumber: new Map(
      itemsByNumber
        .filter((item) => item.itemNumber)
        .map((item) => [normalizeIdentifier(item.itemNumber), item])
    ),
  };
}

export async function normalizeInvoiceItemsForSave(
  db: Db,
  userId: string,
  items: InvoiceItemInput[],
  session?: ClientSession
): Promise<InvoiceItem[]> {
  const inventoryLookups = await getInventoryLookups(db, userId, items, session);
  const normalizedItems: InvoiceItem[] = [];

  for (const item of items) {
    const itemNumber = normalizeItemNumber(item.itemNumber);
    const itemName = normalizeItemName(item.itemName);

    if (item.inventoryItemId) {
      const inventoryItem = inventoryLookups.byId.get(item.inventoryItemId);

      if (!inventoryItem) {
        throw new InvoiceStockError(
          'INVENTORY_ITEM_NOT_FOUND',
          'Selected inventory item was not found',
          404
        );
      }

      const storedItemNumber = inventoryItem.itemNumber || '';
      if (itemNumber && itemNumber.toLowerCase() !== storedItemNumber.toLowerCase()) {
        throw new InvoiceStockError(
          'INVENTORY_ITEM_MISMATCH',
          'Selected inventory item does not match the entered part number',
          400
        );
      }

      normalizedItems.push({
        inventoryItemId: inventoryItem._id.toString(),
        itemNumber: storedItemNumber,
        itemName: inventoryItem.itemName,
        quantity: item.quantity,
        amount: item.amount,
      });
      continue;
    }

    if (itemNumber) {
      const inventoryItem = inventoryLookups.byNumber.get(normalizeIdentifier(itemNumber));

      if (inventoryItem) {
        normalizedItems.push({
          inventoryItemId: inventoryItem._id.toString(),
          itemNumber: inventoryItem.itemNumber || itemNumber,
          itemName: inventoryItem.itemName,
          quantity: item.quantity,
          amount: item.amount,
        });
        continue;
      }
    }

    normalizedItems.push({
      itemNumber: itemNumber || undefined,
      itemName,
      quantity: item.quantity,
      amount: item.amount,
    });
  }

  return normalizedItems;
}

export async function applyInventoryAdjustments(
  db: Db,
  userId: string,
  adjustments: InventoryAdjustment[],
  session?: ClientSession
): Promise<string[]> {
  const inventoryCollection = db.collection<InventorySnapshot>('inventory');
  const changedInventoryIds: string[] = [];
  const updatedAt = new Date();

  for (const adjustment of adjustments) {
    assertValidInventoryId(adjustment.inventoryItemId);

    const objectId = new ObjectId(adjustment.inventoryItemId);
    const filter: Record<string, unknown> = { _id: objectId, userId };
    const quantityDelta = adjustment.quantityDelta;

    if (quantityDelta < 0) {
      filter.quantity = { $gte: Math.abs(quantityDelta) };
    }

    const result = await inventoryCollection.findOneAndUpdate(
      filter,
      {
        $inc: { quantity: quantityDelta },
        $set: {
          lastQuantityUpdatedAt: updatedAt,
          updatedAt,
        },
      },
      { returnDocument: 'after', session }
    );

    if (!result) {
      const current = await inventoryCollection.findOne(
        { _id: objectId, userId },
        {
          projection: { _id: 1, itemName: 1, itemNumber: 1, quantity: 1 },
          session,
        }
      );

      if (!current) {
        throw new InvoiceStockError(
          'INVENTORY_ITEM_NOT_FOUND',
          'Inventory item linked to this invoice was not found',
          404,
          { inventoryItemId: adjustment.inventoryItemId }
        );
      }

      throw new InvoiceStockError(
        'INSUFFICIENT_STOCK',
        `Not enough stock for ${current.itemName}`,
        409,
        {
          inventoryItemId: current._id.toString(),
          itemNumber: current.itemNumber || '',
          itemName: current.itemName,
          availableQuantity: current.quantity || 0,
          requestedQuantity: Math.abs(quantityDelta),
        }
      );
    }

    if (typeof inventoryCollection.updateOne === 'function') {
      await inventoryCollection.updateOne(
        { _id: objectId, userId },
        { $set: inventoryDerivedFields(result as unknown as InventoryItem) },
        { session }
      );
    }

    changedInventoryIds.push(adjustment.inventoryItemId);
  }

  return changedInventoryIds;
}
