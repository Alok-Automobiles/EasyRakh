import type { Document } from 'mongodb';
import { compactSearchIdentifier, normalizeIdentifier } from './search-normalization';

export const DEFAULT_MONGODB_SEARCH_INDEX = 'easyrakh_search';
export const MONGODB_SEARCH_COLLECTIONS = [
  'inventory',
  'customers',
  'suppliers',
  'customEntities',
  'invoices',
] as const;

export type MongoSearchCollection = (typeof MONGODB_SEARCH_COLLECTIONS)[number];

type SearchClause = Record<string, unknown>;

export function isMongoSearchEnabled(collection?: MongoSearchCollection): boolean {
  if (process.env.MONGODB_SEARCH_ENABLED?.trim().toLowerCase() !== 'true') return false;

  const configuredCollections = process.env.MONGODB_SEARCH_COLLECTIONS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!collection || !configuredCollections?.length) return true;

  return configuredCollections.includes(collection);
}

export function getMongoSearchIndexName(): string {
  return process.env.MONGODB_SEARCH_INDEX?.trim() || DEFAULT_MONGODB_SEARCH_INDEX;
}

function fuzzyOptions(query: string) {
  const compactLength = normalizeIdentifier(query).replace(/[^A-Z0-9]/g, '').length;
  return {
    maxEdits: compactLength >= 8 ? 2 : 1,
    prefixLength: compactLength >= 5 ? 1 : 0,
    maxExpansions: 50,
  };
}

function boost(value: number) {
  return { boost: { value } };
}

function autocomplete(
  path: string,
  query: string,
  weight: number,
  options: { compact?: boolean; fuzzy?: boolean; normalized?: boolean } = {}
): SearchClause {
  const normalizedQuery = options.compact
    ? compactSearchIdentifier(query)
    : options.normalized
      ? normalizeIdentifier(query)
      : query;
  return {
    autocomplete: {
      path,
      query: normalizedQuery,
      tokenOrder: 'any',
      ...(options.fuzzy ? { fuzzy: fuzzyOptions(query) } : {}),
      score: boost(weight),
    },
  };
}

function text(
  paths: string | string[],
  query: string,
  weight: number,
  fuzzy = false
): SearchClause {
  return {
    text: {
      path: paths,
      query,
      ...(fuzzy ? { fuzzy: fuzzyOptions(query) } : {}),
      score: boost(weight),
    },
  };
}

function phrase(path: string, query: string, weight: number): SearchClause {
  return {
    phrase: {
      path,
      query,
      score: boost(weight),
    },
  };
}

function tenantFilter(userId: string): SearchClause {
  return { equals: { path: 'userId', value: userId } };
}

function searchStage(filter: SearchClause[], should: SearchClause[]): Document {
  return {
    $search: {
      index: getMongoSearchIndexName(),
      compound: {
        filter,
        should,
        minimumShouldMatch: 1,
      },
    },
  };
}

export function buildInventorySearchStage(userId: string, query: string): Document {
  const identifierQuery = normalizeIdentifier(query);
  return searchStage(
    [tenantFilter(userId)],
    [
      phrase('itemNumberKey', identifierQuery, 30),
      phrase('itemNumber', identifierQuery, 28),
      phrase('uniqueCode', identifierQuery, 26),
      autocomplete('itemNumberKey', query, 18, { normalized: true }),
      autocomplete('itemNumber', query, 17, { normalized: true }),
      autocomplete('searchIdentifiers', query, 20, { compact: true }),
      autocomplete('uniqueCode', query, 16, { normalized: true }),
      autocomplete('itemName', query, 12, { fuzzy: true }),
      autocomplete('brand', query, 8, { fuzzy: true }),
      autocomplete('location', query, 7),
      autocomplete('supplier', query, 6, { fuzzy: true }),
      text(
        ['itemName', 'itemNumber', 'uniqueCode', 'brand', 'location', 'supplier', 'description'],
        query,
        5,
        true
      ),
    ]
  );
}

export function buildEntitySearchStage(
  userId: string,
  query: string,
  collectionType?: string,
  includeCollectionType = false
): Document {
  const filter = [tenantFilter(userId)];
  if (collectionType) {
    filter.push({ equals: { path: 'collectionType', value: collectionType } });
  }

  const should = [
    phrase('phone', query, 22),
    autocomplete('searchIdentifiers', query, 18, { compact: true }),
    autocomplete('phone', query, 16),
    autocomplete('name', query, 14, { fuzzy: true }),
    autocomplete('email', query, 8),
    autocomplete('address', query, 5, { fuzzy: true }),
    text(['name', 'phone', 'email', 'address'], query, 4, true),
  ];
  if (includeCollectionType) {
    should.push(
      autocomplete('collectionType', query, 6, { fuzzy: true }),
      text('collectionType', query, 4, true)
    );
  }

  return searchStage(filter, should);
}

export function buildInvoiceSearchStage(userId: string, query: string): Document {
  const identifierQuery = normalizeIdentifier(query);
  return searchStage(
    [tenantFilter(userId)],
    [
      phrase('invoiceNumber', identifierQuery, 28),
      autocomplete('searchIdentifiers', query, 20, { compact: true }),
      autocomplete('invoiceNumber', query, 18, { normalized: true }),
      autocomplete('customerPhone', query, 14),
      autocomplete('customerName', query, 12, { fuzzy: true }),
      text(['invoiceNumber', 'customerName', 'customerPhone'], query, 5, true),
    ]
  );
}

export function searchScoreStages(): Document[] {
  return [
    { $set: { _searchScore: { $meta: 'searchScore' } } },
    { $sort: { _searchScore: -1, updatedAt: -1, createdAt: -1 } },
  ];
}

export async function withMongoSearchFallback<T>(
  label: string,
  search: () => Promise<T>,
  fallback: () => Promise<T>,
  collection?: MongoSearchCollection
): Promise<T> {
  if (!isMongoSearchEnabled(collection)) return fallback();

  try {
    return await search();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown MongoDB Search error';
    console.warn(`MongoDB Search failed for ${label}; using MongoDB fallback: ${message}`);
    return fallback();
  }
}
