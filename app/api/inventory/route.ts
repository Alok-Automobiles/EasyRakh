import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import type { InventoryItem, InventoryStats } from '@/lib/types';
import redis, { cacheGet } from '@/lib/redis';
import {
  INVENTORY_LIST_TTL_SECONDS,
  INVENTORY_SUMMARY_TTL_SECONDS,
  inventoryListKey,
  inventorySummaryKey,
  invalidateInventoryCache,
} from '@/lib/cache';
import { z } from 'zod';

const LOW_STOCK_THRESHOLD = 5;

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
  itemNumber: z.string().trim().min(1, 'Item number is required'),
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serializeInventoryItem(item: InventoryItem & { _id: { toString(): string } }) {
  return {
    id: item._id.toString(),
    itemName: item.itemName,
    itemNumber: item.itemNumber,
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
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeItemInput(data: z.infer<typeof inventoryItemSchema>) {
  return {
    itemName: data.itemName,
    itemNumber: data.itemNumber,
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
  };
}

async function getInventoryStats(userId: string): Promise<InventoryStats> {
  const db = await getDb();
  const inventoryCollection = db.collection<InventoryItem>('inventory');

  const [stats] = await inventoryCollection
    .aggregate<InventoryStats>([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } },
          totalValue: {
            $sum: {
              $multiply: [
                { $ifNull: ['$quantity', 0] },
                { $ifNull: ['$buyingPrice', 0] },
              ],
            },
          },
          outOfStockItems: {
            $sum: { $cond: [{ $lte: [{ $ifNull: ['$quantity', 0] }, 0] }, 1, 0] },
          },
          restockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $ifNull: ['$quantity', 0] }, 0] },
                    { $lte: [{ $ifNull: ['$quantity', 0] }, LOW_STOCK_THRESHOLD] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          locations: { $addToSet: '$location' },
          brands: { $addToSet: '$brand' },
        },
      },
      {
        $project: {
          _id: 0,
          totalItems: 1,
          totalQuantity: 1,
          totalValue: 1,
          outOfStockItems: 1,
          restockItems: 1,
          lowStockThreshold: { $literal: LOW_STOCK_THRESHOLD },
          locations: {
            $filter: {
              input: '$locations',
              as: 'location',
              cond: { $ne: ['$$location', ''] },
            },
          },
          brands: {
            $filter: {
              input: '$brands',
              as: 'brand',
              cond: { $ne: ['$$brand', ''] },
            },
          },
        },
      },
    ])
    .toArray();

  return stats || {
    totalItems: 0,
    totalQuantity: 0,
    totalValue: 0,
    outOfStockItems: 0,
    restockItems: 0,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    locations: [],
    brands: [],
  };
}

type SerializedItem = ReturnType<typeof serializeInventoryItem>;

function safeParseCache<T>(cached: string | null, cacheKey: string): T | null {
  if (!cached) return null;
  try {
    return JSON.parse(cached) as T;
  } catch (err) {
    console.warn(`cache parse failed for ${cacheKey}, treating as miss:`, err);
    redis.del(cacheKey).catch((delErr) =>
      console.warn(`stale cache delete failed for ${cacheKey}:`, delErr)
    );
    return null;
  }
}

interface ListCachePayload {
  items: SerializedItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface SummaryCachePayload {
  stats: InventoryStats;
  lowStockItems: SerializedItem[];
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || 'all';
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const listCacheKey = inventoryListKey(userId, { page, limit, status, search });
    const summaryCacheKey = inventorySummaryKey(userId);

    const [cachedList, cachedSummary] = await Promise.all([
      cacheGet(listCacheKey),
      cacheGet(summaryCacheKey),
    ]);

    let listPayload = safeParseCache<ListCachePayload>(cachedList, listCacheKey);
    let summaryPayload = safeParseCache<SummaryCachePayload>(cachedSummary, summaryCacheKey);

    if (!listPayload || !summaryPayload) {
      const db = await getDb();
      const inventoryCollection = db.collection<InventoryItem>('inventory');

      const buildListPayload = async (): Promise<ListCachePayload> => {
        const query: Record<string, unknown> = { userId };

        if (search) {
          const regex = new RegExp(escapeRegex(search), 'i');
          query.$or = [
            { itemName: regex },
            { itemNumber: regex },
            { uniqueCode: regex },
            { brand: regex },
            { location: regex },
            { supplier: regex },
          ];
        }

        if (status === 'in-stock') {
          query.quantity = { $gt: LOW_STOCK_THRESHOLD };
        } else if (status === 'low-stock' || status === 'restock') {
          query.quantity = { $gt: 0, $lte: LOW_STOCK_THRESHOLD };
        } else if (status === 'out-of-stock') {
          query.quantity = { $lte: 0 };
        }

        const [items, total] = await Promise.all([
          inventoryCollection
            .find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          inventoryCollection.countDocuments(query),
        ]);

        return {
          items: items.map(serializeInventoryItem),
          pagination: {
            total,
            page,
            pageSize: limit,
            totalPages: Math.max(Math.ceil(total / limit), 1),
          },
        };
      };

      const buildSummaryPayload = async (): Promise<SummaryCachePayload> => {
        const [stats, lowStockItems] = await Promise.all([
          getInventoryStats(userId),
          inventoryCollection
            .find({ userId, quantity: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } })
            .sort({ quantity: 1, updatedAt: -1 })
            .limit(6)
            .toArray(),
        ]);

        return {
          stats,
          lowStockItems: lowStockItems.map(serializeInventoryItem),
        };
      };

      const [resolvedList, resolvedSummary] = await Promise.all([
        listPayload ?? buildListPayload(),
        summaryPayload ?? buildSummaryPayload(),
      ]);

      if (!listPayload) {
        listPayload = resolvedList;
        redis
          .setex(listCacheKey, INVENTORY_LIST_TTL_SECONDS, JSON.stringify(listPayload))
          .catch((err) => console.warn('inventory list cache write failed:', err));
      }

      if (!summaryPayload) {
        summaryPayload = resolvedSummary;
        redis
          .setex(summaryCacheKey, INVENTORY_SUMMARY_TTL_SECONDS, JSON.stringify(summaryPayload))
          .catch((err) => console.warn('inventory summary cache write failed:', err));
      }
    }

    return NextResponse.json({
      items: listPayload.items,
      stats: summaryPayload.stats,
      lowStockItems: summaryPayload.lowStockItems,
      pagination: listPayload.pagination,
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = inventoryItemSchema.parse(body);
    const now = new Date();
    const itemData = normalizeItemInput(validatedData);

    const db = await getDb();
    const inventoryCollection = db.collection<InventoryItem>('inventory');

    const existing = await inventoryCollection.findOne(
      {
        userId,
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

    const result = await inventoryCollection.insertOne({
      userId,
      ...itemData,
      createdAt: now,
      updatedAt: now,
    });

    invalidateInventoryCache(userId).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

    return NextResponse.json(
      {
        message: 'Inventory item created successfully',
        item: {
          id: result.insertedId.toString(),
          ...itemData,
          createdAt: now,
          updatedAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }

    console.error('Create inventory item error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
