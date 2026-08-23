import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntitySearchStage,
  buildInventorySearchStage,
  buildInvoiceSearchStage,
  getMongoSearchIndexName,
  isMongoSearchEnabled,
  withMongoSearchFallback,
} from '@/lib/mongodb-search';
import { MONGODB_SEARCH_INDEXES } from '@/lib/mongodb-search-indexes';

const originalEnabled = process.env.MONGODB_SEARCH_ENABLED;
const originalIndex = process.env.MONGODB_SEARCH_INDEX;
const originalCollections = process.env.MONGODB_SEARCH_COLLECTIONS;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.MONGODB_SEARCH_ENABLED;
  else process.env.MONGODB_SEARCH_ENABLED = originalEnabled;
  if (originalIndex === undefined) delete process.env.MONGODB_SEARCH_INDEX;
  else process.env.MONGODB_SEARCH_INDEX = originalIndex;
  if (originalCollections === undefined) delete process.env.MONGODB_SEARCH_COLLECTIONS;
  else process.env.MONGODB_SEARCH_COLLECTIONS = originalCollections;
  vi.restoreAllMocks();
});

describe('MongoDB Search configuration', () => {
  it('is opt-in and supports a configured index name', () => {
    delete process.env.MONGODB_SEARCH_ENABLED;
    expect(isMongoSearchEnabled()).toBe(false);

    process.env.MONGODB_SEARCH_ENABLED = 'TRUE';
    process.env.MONGODB_SEARCH_INDEX = 'staging_search';
    expect(isMongoSearchEnabled()).toBe(true);
    expect(getMongoSearchIndexName()).toBe('staging_search');
  });

  it('can enable only the three indexes available on Atlas Free', () => {
    process.env.MONGODB_SEARCH_ENABLED = 'true';
    process.env.MONGODB_SEARCH_COLLECTIONS = 'inventory, customers, invoices';

    expect(isMongoSearchEnabled('inventory')).toBe(true);
    expect(isMongoSearchEnabled('customers')).toBe(true);
    expect(isMongoSearchEnabled('invoices')).toBe(true);
    expect(isMongoSearchEnabled('suppliers')).toBe(false);
    expect(isMongoSearchEnabled('customEntities')).toBe(false);
  });

  it('always filters searches by tenant and normalizes inventory identifiers', () => {
    const inventory = buildInventorySearchStage('user-1', 'bp-4567');
    const serialized = JSON.stringify(inventory);

    expect(inventory).toMatchObject({
      $search: {
        compound: {
          filter: [{ equals: { path: 'userId', value: 'user-1' } }],
          minimumShouldMatch: 1,
        },
      },
    });
    expect(serialized).toContain('BP-4567');
    expect(serialized).toContain('itemNumberKey');
  });

  it('adds the entity type to the search-engine filter for custom ledgers', () => {
    expect(buildEntitySearchStage('user-1', 'raj', 'transporters')).toMatchObject({
      $search: {
        compound: {
          filter: [
            { equals: { path: 'userId', value: 'user-1' } },
            { equals: { path: 'collectionType', value: 'transporters' } },
          ],
        },
      },
    });
    expect(
      JSON.stringify(buildEntitySearchStage('user-1', 'transporters', undefined, true))
    ).toContain('collectionType');
    expect(JSON.stringify(buildInvoiceSearchStage('user-1', 'inv-100'))).toContain('INV-100');
  });

  it('configures n-grams for item-number suffix and substring matching', () => {
    const inventoryIndex = MONGODB_SEARCH_INDEXES.find(
      (index) => index.collection === 'inventory'
    );
    const fields = inventoryIndex?.definition.mappings.fields as Record<string, unknown>;
    const itemNumberKey = fields.itemNumberKey;

    expect(itemNumberKey).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'autocomplete',
          tokenization: 'nGram',
          minGrams: 2,
        }),
      ])
    );
  });

  it('maps custom entity types for both equality filters and text search', () => {
    const customEntityIndex = MONGODB_SEARCH_INDEXES.find(
      (index) => index.collection === 'customEntities'
    );
    const fields = customEntityIndex?.definition.mappings.fields as Record<string, unknown>;

    expect(fields.collectionType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'token' }),
        expect.objectContaining({ type: 'autocomplete', tokenization: 'edgeGram' }),
      ])
    );
  });

  it('falls back when disabled or when MongoDB Search is unavailable', async () => {
    const search = vi.fn().mockResolvedValue('search');
    const fallback = vi.fn().mockResolvedValue('fallback');

    delete process.env.MONGODB_SEARCH_ENABLED;
    await expect(withMongoSearchFallback('test', search, fallback)).resolves.toBe('fallback');
    expect(search).not.toHaveBeenCalled();

    process.env.MONGODB_SEARCH_ENABLED = 'true';
    search.mockRejectedValueOnce(new Error('index missing'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(withMongoSearchFallback('test', search, fallback)).resolves.toBe('fallback');

    process.env.MONGODB_SEARCH_COLLECTIONS = 'inventory,customers,invoices';
    search.mockClear();
    await expect(
      withMongoSearchFallback('supplier test', search, fallback, 'suppliers')
    ).resolves.toBe('fallback');
    expect(search).not.toHaveBeenCalled();
  });
});
