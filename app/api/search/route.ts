import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rateLimit';
import { getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';
import { queryTokens } from '@/lib/search-normalization';
import type { Db, Document } from 'mongodb';
import {
  buildEntitySearchStage,
  buildInventorySearchStage,
  buildInvoiceSearchStage,
  searchScoreStages,
  type MongoSearchCollection,
  withMongoSearchFallback,
} from '@/lib/mongodb-search';
import { fuzzyCandidateTokens, scoreInventorySearch } from '@/lib/inventory-search';

interface SearchResult {
  id: string;
  name: string;
  type: 'customer' | 'supplier' | 'custom_entity' | 'invoice' | 'inventory';
  subtitle?: string;
  badge?: string;
  href: string;
  balance?: number;
}

async function searchCollection(
  db: Db,
  collectionName: MongoSearchCollection,
  label: string,
  searchStage: Document,
  fallbackFilter: Document,
  projection: Document
) {
  const collection = db.collection(collectionName);
  return withMongoSearchFallback<Document[]>(
    label,
    () =>
      collection
        .aggregate([
          searchStage,
          ...searchScoreStages(),
          { $limit: 5 },
          { $project: projection },
        ])
        .toArray(),
    () => collection.find(fallbackFilter).project(projection).limit(5).toArray(),
    collectionName
  );
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.read);
    if (rateLimitResponse) return rateLimitResponse;

    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';

    if (query.length < 2) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const tokens = queryTokens(query);
    if (tokens.length === 0) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const cacheKey = await requestCacheKey(request, 'search', userId, query.toLowerCase());
    const cached = await getCachedJson<{ results: SearchResult[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const db = await getDb();
    const tokenQuery = { $all: tokens };

    const [customers, suppliers, customEntities, invoices, inventory] = await Promise.all([
      searchCollection(
        db,
        'customers',
        'global customer search',
        buildEntitySearchStage(userId, query),
        { userId, searchTokens: tokenQuery },
        { _id: 1, name: 1, phone: 1, email: 1 }
      ),
      searchCollection(
        db,
        'suppliers',
        'global supplier search',
        buildEntitySearchStage(userId, query),
        { userId, searchTokens: tokenQuery },
        { _id: 1, name: 1, phone: 1, email: 1 }
      ),
      searchCollection(
        db,
        'customEntities',
        'global custom entity search',
        buildEntitySearchStage(userId, query),
        { userId, searchTokens: tokenQuery },
        { _id: 1, name: 1, phone: 1, collectionType: 1 }
      ),
      searchCollection(
        db,
        'invoices',
        'global invoice search',
        buildInvoiceSearchStage(userId, query),
        { userId, searchTokens: tokenQuery },
        { _id: 1, invoiceNumber: 1, customerName: 1, totalAmount: 1, status: 1 }
      ),
      withMongoSearchFallback<Document[]>(
        'global inventory search',
        () =>
          db
            .collection('inventory')
            .aggregate([
              buildInventorySearchStage(userId, query),
              ...searchScoreStages(),
              { $limit: 5 },
              {
                $project: {
                  _id: 1,
                  itemName: 1,
                  itemNumber: 1,
                  quantity: 1,
                  unitOfMeasure: 1,
                  location: 1,
                },
              },
            ])
            .toArray(),
        async () => {
          const fuzzyTokens = fuzzyCandidateTokens(query);
          const candidates = await db
            .collection('inventory')
            .find({
              userId,
              $or: [
                { searchTokens: tokenQuery },
                ...(fuzzyTokens.length ? [{ fuzzySearchTokens: { $in: fuzzyTokens } }] : []),
              ],
            })
            .project({
              _id: 1,
              itemName: 1,
              itemNumber: 1,
              quantity: 1,
              unitOfMeasure: 1,
              location: 1,
            })
            .limit(100)
            .toArray();
          return candidates
            .map((item) => ({ item, score: scoreInventorySearch(item, query) }))
            .filter(({ score }) => score >= 0.42)
            .sort((left, right) => right.score - left.score)
            .slice(0, 5)
            .map(({ item }) => item);
        },
        'inventory'
      ),
    ]);

    const results: SearchResult[] = [];

    for (const c of customers) {
      results.push({
        id: c._id.toString(),
        name: c.name,
        type: 'customer',
        subtitle: c.phone || c.email || undefined,
        badge: 'Customer',
        href: `/ledger/customer/${c._id.toString()}`,
      });
    }

    for (const s of suppliers) {
      results.push({
        id: s._id.toString(),
        name: s.name,
        type: 'supplier',
        subtitle: s.phone || s.email || undefined,
        badge: 'Supplier',
        href: `/ledger/supplier/${s._id.toString()}`,
      });
    }

    for (const e of customEntities) {
      results.push({
        id: e._id.toString(),
        name: e.name,
        type: 'custom_entity',
        subtitle: e.phone || undefined,
        badge: e.collectionType || 'Entity',
        href: `/ledger/${e.collectionType}/${e._id.toString()}`,
      });
    }

    for (const inv of invoices) {
      const statusLabel = inv.status === 'paid' ? 'Paid' : inv.status === 'partial' ? 'Partial' : 'Unpaid';
      results.push({
        id: inv._id.toString(),
        name: inv.invoiceNumber,
        type: 'invoice',
        subtitle: `${inv.customerName} — ₹${(inv.totalAmount || 0).toLocaleString('en-IN')}`,
        badge: statusLabel,
        href: `/invoices/${inv._id.toString()}`,
      });
    }

    for (const item of inventory) {
      const itemNumber = String(item.itemNumber || '');
      const itemName = String(item.itemName || 'Inventory item');
      results.push({
        id: item._id.toString(),
        name: itemNumber || itemName,
        type: 'inventory',
        subtitle: `${itemName}${item.location ? ` — ${item.location}` : ''}`,
        badge: `${Number(item.quantity || 0)} ${item.unitOfMeasure || ''}`.trim(),
        href: `/inventory-items?search=${encodeURIComponent(itemNumber || itemName)}`,
      });
    }

    const responseData = { results };

    await setCachedJson(cacheKey, 60, responseData);

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
