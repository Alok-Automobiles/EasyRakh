import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { checkRateLimit, rateLimitConfigs } from '@/lib/rateLimit';
import { getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';
import { queryTokens } from '@/lib/search-normalization';

interface SearchResult {
  id: string;
  name: string;
  type: 'customer' | 'supplier' | 'custom_entity' | 'invoice';
  subtitle?: string;
  badge?: string;
  href: string;
  balance?: number;
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

    const [customers, suppliers, customEntities, invoices] = await Promise.all([
      db.collection('customers')
        .find({
          userId,
          searchTokens: tokenQuery,
        })
        .project({ _id: 1, name: 1, phone: 1, email: 1 })
        .limit(5)
        .toArray(),

      db.collection('suppliers')
        .find({
          userId,
          searchTokens: tokenQuery,
        })
        .project({ _id: 1, name: 1, phone: 1, email: 1 })
        .limit(5)
        .toArray(),

      db.collection('customEntities')
        .find({
          userId,
          searchTokens: tokenQuery,
        })
        .project({ _id: 1, name: 1, phone: 1, collectionType: 1 })
        .limit(5)
        .toArray(),

      db.collection('invoices')
        .find({
          userId,
          searchTokens: tokenQuery,
        })
        .project({ _id: 1, invoiceNumber: 1, customerName: 1, totalAmount: 1, status: 1 })
        .limit(5)
        .toArray(),
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

    const responseData = { results };

    await setCachedJson(cacheKey, 60, responseData);

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
