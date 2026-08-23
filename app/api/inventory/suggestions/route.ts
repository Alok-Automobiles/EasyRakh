import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import type { InventoryItem } from '@/lib/types';
import {
  normalizeIdentifier,
  queryTokens,
} from '@/lib/search-normalization';
import {
  fuzzyCandidateTokens,
  scoreInventorySearch,
} from '@/lib/inventory-search';
import {
  buildInventorySearchStage,
  searchScoreStages,
  withMongoSearchFallback,
} from '@/lib/mongodb-search';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    // Keep itemNumber as a compatibility alias for older invoice clients.
    const query = (
      searchParams.get('query') ||
      searchParams.get('itemNumber') ||
      ''
    ).trim().slice(0, 100);
    const limitParam = Number(searchParams.get('limit') || '8');
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 10)
      : 8;

    if (!query) {
      return NextResponse.json({ items: [] });
    }

    const db = await getDb();
    const inventoryCollection = db.collection<InventoryItem>('inventory');
    const projection = {
      _id: 1,
      itemNumber: 1,
      itemName: 1,
      quantity: 1,
      unitOfMeasure: 1,
      buyingPrice: 1,
      uniqueCode: 1,
      brand: 1,
      location: 1,
      updatedAt: 1,
    };

    const items = await withMongoSearchFallback(
      'inventory suggestions',
      async () =>
        inventoryCollection
          .aggregate<InventoryItem>([
            buildInventorySearchStage(userId, query),
            ...searchScoreStages(),
            { $sort: { _searchScore: -1, quantity: -1, updatedAt: -1 } },
            { $limit: limit },
            { $project: projection },
          ])
          .toArray(),
      async () => {
        const normalizedQuery = normalizeIdentifier(query);
        const prefixRegex = { $regex: `^${escapeRegex(normalizedQuery)}` };
        const exactSearchTokens = queryTokens(query);
        const fuzzyTokens = fuzzyCandidateTokens(query);
        const searchClauses: Record<string, unknown>[] = [
          { itemNumberKey: prefixRegex },
          { itemName: prefixRegex },
          { uniqueCode: prefixRegex },
          { brand: prefixRegex },
          { location: prefixRegex },
        ];
        if (exactSearchTokens.length > 0) {
          searchClauses.push({ searchTokens: { $all: exactSearchTokens } });
        }
        if (fuzzyTokens.length > 0) {
          searchClauses.push({ fuzzySearchTokens: { $in: fuzzyTokens } });
        }

        const candidates = await inventoryCollection
          .find({ userId, $or: searchClauses }, { projection })
          .sort({ updatedAt: -1 })
          .limit(100)
          .toArray();

        return candidates
          .map((item, index) => ({ item, index, score: scoreInventorySearch(item, query) }))
          .filter(({ score }) => score >= 0.42)
          .sort(
            (left, right) =>
              right.score - left.score ||
              Number(right.item.quantity || 0) - Number(left.item.quantity || 0) ||
              left.index - right.index
          )
          .slice(0, limit)
          .map(({ item }) => item);
      },
      'inventory'
    );

    return NextResponse.json({
      items: items.map((item) => ({
        id: item._id!.toString(),
        itemNumber: item.itemNumber || '',
        itemName: item.itemName,
        quantity: item.quantity || 0,
        unitOfMeasure: item.unitOfMeasure || '',
        buyingPrice: item.buyingPrice ?? null,
        uniqueCode: item.uniqueCode || '',
        brand: item.brand || '',
        location: item.location || '',
      })),
    });
  } catch (error) {
    console.error('Inventory suggestions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
