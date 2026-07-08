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
import { uppercaseInventoryPayload } from '@/lib/inventory-text';
import { scoreInventoryItem } from '@/lib/voice-assistant';
import { getCacheVersion } from '@/lib/cache-version';
import { queryTokens, normalizeIdentifier } from '@/lib/search-normalization';
import { ensureUserReadModels, inventoryDerivedFields, refreshUserReadModels } from '@/lib/read-models';

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
  partImagePublicIds: z.array(z.string().trim().min(1)).optional(),
  brand: z.string().trim().optional(),
  description: z.string().trim().optional(),
  buyingPrice: z.number().min(0, 'Buying price cannot be negative').optional().nullable(),
  mrp: z.number().min(0, 'MRP cannot be negative').optional().nullable(),
  supplier: z.string().trim().optional(),
  billingDate: optionalDateSchema,
  billImages: z.array(z.string().url('Invalid bill image URL')).optional(),
  billImagePublicIds: z.array(z.string().trim().min(1)).optional(),
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
    partImagePublicIds: item.partImagePublicIds || [],
    brand: item.brand || '',
    description: item.description || '',
    buyingPrice: item.buyingPrice ?? undefined,
    mrp: item.mrp ?? undefined,
    supplier: item.supplier || '',
    billingDate: item.billingDate,
    billImages: item.billImages || [],
    billImagePublicIds: item.billImagePublicIds || [],
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
    partImagePublicIds: data.partImagePublicIds || [],
    brand: data.brand || '',
    description: data.description || '',
    buyingPrice: data.buyingPrice ?? undefined,
    mrp: data.mrp ?? undefined,
    supplier: data.supplier || '',
    billingDate: data.billingDate,
    billImages: data.billImages || [],
    billImagePublicIds: data.billImagePublicIds || [],
  });
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
    const cacheVersion = await getCacheVersion('inventory', userId);

    const listCacheKey = inventoryListKey(userId, { page, limit, status, search, version: cacheVersion });
    const summaryCacheKey = inventorySummaryKey(userId, cacheVersion);

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

        if (status === 'in-stock') {
          query.stockStatus = 'in-stock';
        } else if (status === 'low-stock' || status === 'restock') {
          query.stockStatus = 'low-stock';
        } else if (status === 'out-of-stock') {
          query.stockStatus = 'out-of-stock';
        } else if (status === 'inactive') {
          query.stockStatus = 'inactive';
        }

        const tokens = search ? queryTokens(search) : [];

        if (tokens.length > 0) {
          query.searchTokens = { $all: tokens };
        }

        if (tokens.length > 0) {
          // Score a bounded indexed candidate set in memory for typo tolerance.
          const candidates = await inventoryCollection
            .find(query)
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(500)
            .toArray();

          const scored = candidates
            .map((item) => ({
              item,
              score: scoreInventoryItem(item, tokens),
            }))
            .filter(({ score }) => score >= 0.25)
            .sort((a, b) => b.score - a.score || b.item.updatedAt.getTime() - a.item.updatedAt.getTime());

          const total = scored.length;
          const paginatedItems = scored
            .slice(skip, skip + limit)
            .map(({ item }) => item);

          return {
            items: paginatedItems.map(serializeInventoryItem),
            pagination: {
              total,
              page,
              pageSize: limit,
              totalPages: Math.max(Math.ceil(total / limit), 1),
            },
          };
        } else {
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
        }
      };

      const buildSummaryPayload = async (): Promise<SummaryCachePayload> => {
        const [summary, lowStockItems] = await Promise.all([
          ensureUserReadModels(db, userId),
          inventoryCollection
            .find({ userId, stockStatus: 'low-stock' })
            .sort({ quantity: 1, updatedAt: -1, createdAt: -1 })
            .limit(20)
            .toArray(),
        ]);

        return {
          stats: summary.inventory,
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

    if (itemData.itemNumber) {
      const existing = await inventoryCollection.findOne(
        {
          userId,
          itemNumberKey: normalizeIdentifier(itemData.itemNumber),
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

    const result = await inventoryCollection.insertOne({
      userId,
      ...itemData,
      lastQuantityUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
      ...inventoryDerivedFields({
        ...itemData,
        lastQuantityUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    });

    await Promise.all([
      refreshUserReadModels(db, userId),
      invalidateInventoryCache(userId),
    ]);

    return NextResponse.json(
      {
        message: 'Inventory item created successfully',
        item: {
          id: result.insertedId.toString(),
          ...itemData,
          lastQuantityUpdatedAt: now,
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
