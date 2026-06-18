import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import type { InventoryItem } from '@/lib/types';
import { ObjectId } from 'mongodb';
import redis, { cacheGet } from '@/lib/redis';
import {
  INVENTORY_ITEM_TTL_SECONDS,
  inventoryItemKey,
  invalidateInventoryCache,
} from '@/lib/cache';
import { z } from 'zod';
import { uppercaseInventoryPayload } from '@/lib/inventory-text';

const optionalDateSchema = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    return value;
  },
  z.date().refine((date) => !Number.isNaN(date.getTime()), 'Invalid billing date').optional()
);

const inventoryItemSchema = z.object({
  itemName: z.string().trim().min(1, 'Item name is required'),
  itemNumber: z.string().trim().optional(),
  uniqueCode: z.string().trim().optional(),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  location: z.string().trim().min(1, 'Location is required'),
  unitOfMeasure: z.string().trim().min(1, 'Unit of measure is required'),
  partImages: z.array(z.string().url('Invalid part image URL')).optional(),
  brand: z.string().trim().optional(),
  description: z.string().trim().optional(),
  buyingPrice: z.number().min(0, 'Buying price cannot be negative').optional().nullable(),
  mrp: z.number().min(0, 'MRP cannot be negative').optional().nullable(),
  supplier: z.string().trim().optional(),
  billingDate: optionalDateSchema,
  billImages: z.array(z.string().url('Invalid bill image URL')).optional(),
});

function serializeInventoryItem(item: InventoryItem & { _id: { toString(): string } }) {
  return {
    id: item._id.toString(),
    itemName: item.itemName,
    itemNumber: item.itemNumber || '',
    uniqueCode: item.uniqueCode || '',
    quantity: item.quantity || 0,
    location: item.location || '',
    unitOfMeasure: item.unitOfMeasure || '',
    partImages: item.partImages || [],
    brand: item.brand || '',
    description: item.description || '',
    buyingPrice: item.buyingPrice ?? undefined,
    mrp: item.mrp ?? undefined,
    supplier: item.supplier || '',
    billingDate: item.billingDate,
    billImages: item.billImages || [],
    lastQuantityUpdatedAt: item.lastQuantityUpdatedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeItemInput(data: z.infer<typeof inventoryItemSchema>) {
  return uppercaseInventoryPayload({
    itemName: data.itemName,
    itemNumber: data.itemNumber || '',
    uniqueCode: data.uniqueCode || '',
    quantity: data.quantity,
    location: data.location,
    unitOfMeasure: data.unitOfMeasure,
    partImages: data.partImages || [],
    brand: data.brand || '',
    description: data.description || '',
    buyingPrice: data.buyingPrice ?? undefined,
    mrp: data.mrp ?? undefined,
    supplier: data.supplier || '',
    billingDate: data.billingDate,
    billImages: data.billImages || [],
  });
}

function getObjectId(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const objectId = getObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: 'Invalid inventory item id' }, { status: 400 });
    }

    const cacheKey = inventoryItemKey(userId, id);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      try {
        return NextResponse.json({ item: JSON.parse(cached) });
      } catch (parseError) {
        console.warn('inventory item cache parse failed, falling back to DB:', parseError);
        redis.del(cacheKey).catch((err) =>
          console.warn('inventory item stale cache delete failed:', err)
        );
      }
    }

    const db = await getDb();
    const inventoryCollection = db.collection('inventory');
    const item = await inventoryCollection.findOne({ _id: objectId, userId });

    if (!item) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    const serialized = serializeInventoryItem(
      item as unknown as InventoryItem & { _id: { toString(): string } }
    );

    redis
      .setex(cacheKey, INVENTORY_ITEM_TTL_SECONDS, JSON.stringify(serialized))
      .catch((err) => console.warn('inventory item cache write failed:', err));

    return NextResponse.json({ item: serialized });
  } catch (error) {
    console.error('Get inventory item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const objectId = getObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: 'Invalid inventory item id' }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = inventoryItemSchema.parse(body);
    const itemData = normalizeItemInput(validatedData);
    const updatedAt = new Date();

    const db = await getDb();
    const inventoryCollection = db.collection('inventory');

    const target = await inventoryCollection.findOne(
      { _id: objectId, userId },
      { projection: { _id: 1, quantity: 1 } }
    );
    if (!target) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    const quantityChanged = (target.quantity ?? 0) !== itemData.quantity;
    const updateData = {
      ...itemData,
      ...(quantityChanged ? { lastQuantityUpdatedAt: updatedAt } : {}),
      updatedAt,
    };

    if (itemData.itemNumber) {
      const existing = await inventoryCollection.findOne(
        {
          userId,
          _id: { $ne: objectId },
          itemNumber: { $regex: `^${escapeRegex(itemData.itemNumber)}$`, $options: 'i' },
        },
        { projection: { _id: 1, itemName: 1, itemNumber: 1 } }
      );

      if (existing) {
        return NextResponse.json(
          {
            error: `Item number "${existing.itemNumber}" already exists for "${existing.itemName}". Use a different item number.`,
            code: 'DUPLICATE_ITEM_NUMBER',
            existingItem: {
              id: existing._id.toString(),
              itemName: existing.itemName,
              itemNumber: existing.itemNumber,
            },
          },
          { status: 409 }
        );
      }
    }

    const result = await inventoryCollection.updateOne(
      { _id: objectId, userId },
      {
        $set: {
          ...updateData,
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    await invalidateInventoryCache(userId, id);

    return NextResponse.json({
      message: 'Inventory item updated successfully',
      item: {
        id,
        ...updateData,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('Update inventory item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const quantityPatchSchema = z
  .object({
    delta: z.union([z.literal(1), z.literal(-1)]).optional(),
    quantity: z.number().int().min(0, 'Quantity cannot be negative').optional(),
  })
  .strict()
  .refine(
    (data) =>
      (data.delta !== undefined && data.quantity === undefined) ||
      (data.quantity !== undefined && data.delta === undefined),
    { message: 'Provide either delta or quantity, not both' }
  );

const imagePatchSchema = z.object({
  imageField: z.enum(['partImages', 'billImages']),
  url: z.string().url('Invalid image URL'),
}).strict();

const inventoryPatchSchema = z.union([quantityPatchSchema, imagePatchSchema]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const objectId = getObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: 'Invalid inventory item id' }, { status: 400 });
    }

    const body = await request.json();
    const patch = inventoryPatchSchema.parse(body);

    const db = await getDb();
    const inventoryCollection = db.collection('inventory');
    const updatedAt = new Date();

    if ('imageField' in patch) {
      const result = await inventoryCollection.findOneAndUpdate(
        { _id: objectId, userId },
        {
          $addToSet: { [patch.imageField]: patch.url },
          $set: { updatedAt },
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
      }

      await invalidateInventoryCache(userId, id);

      const item = serializeInventoryItem(
        result as unknown as InventoryItem & { _id: { toString(): string } }
      );

      return NextResponse.json({
        message: 'Image attached successfully',
        item,
      });
    }

    if (patch.quantity !== undefined) {
      const result = await inventoryCollection.findOneAndUpdate(
        { _id: objectId, userId },
        { $set: { quantity: patch.quantity, lastQuantityUpdatedAt: updatedAt, updatedAt } },
        { returnDocument: 'after' }
      );

      if (!result) {
        return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
      }

      await invalidateInventoryCache(userId, id);

      const item = serializeInventoryItem(
        result as unknown as InventoryItem & { _id: { toString(): string } }
      );

      return NextResponse.json({
        message: 'Quantity updated successfully',
        item,
      });
    }

    const { delta } = patch;

    // Atomic update: use $inc with a guard filter to prevent negative quantities
    const filter: Record<string, unknown> = { _id: objectId, userId };
    if (delta === -1) {
      filter.quantity = { $gte: 1 };
    }

    const result = await inventoryCollection.findOneAndUpdate(
      filter,
      { $inc: { quantity: delta }, $set: { lastQuantityUpdatedAt: updatedAt, updatedAt } },
      { returnDocument: 'after' }
    );

    if (!result) {
      // Either item doesn't exist, or quantity is already 0 for a decrement
      const exists = await inventoryCollection.findOne(
        { _id: objectId, userId },
        { projection: { _id: 1, quantity: 1 } }
      );
      if (!exists) {
        return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
      }
      // Quantity was already 0; return current state unchanged
      const current = await inventoryCollection.findOne({ _id: objectId, userId });
      await invalidateInventoryCache(userId, id);
      const item = serializeInventoryItem(
        current as unknown as InventoryItem & { _id: { toString(): string } }
      );
      return NextResponse.json({ message: 'Quantity already at minimum', item });
    }

    await invalidateInventoryCache(userId, id);

    const item = serializeInventoryItem(
      result as unknown as InventoryItem & { _id: { toString(): string } }
    );

    return NextResponse.json({
      message: 'Quantity updated successfully',
      item,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('Patch inventory quantity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const objectId = getObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: 'Invalid inventory item id' }, { status: 400 });
    }

    const db = await getDb();
    const inventoryCollection = db.collection('inventory');
    const result = await inventoryCollection.deleteOne({ _id: objectId, userId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    await invalidateInventoryCache(userId, id);

    return NextResponse.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
