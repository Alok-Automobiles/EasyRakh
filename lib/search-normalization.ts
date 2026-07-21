import type { InventoryItem } from './types';

export const LOW_STOCK_THRESHOLD = 5;
export const INACTIVE_THRESHOLD_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type InventoryStockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'inactive';

export function normalizeSearchText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeIdentifier(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function prefixes(token: string) {
  const values: string[] = [];
  const max = Math.min(token.length, 24);
  for (let i = 2; i <= max; i += 1) {
    values.push(token.slice(0, i));
  }
  return values;
}

export function buildSearchTokens(...values: unknown[]): string[] {
  const tokens = new Set<string>();

  for (const value of values) {
    const normalized = normalizeSearchText(value);
    if (!normalized) continue;

    const words = normalized.split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length === 1) {
        tokens.add(word);
      } else {
        prefixes(word).forEach((prefix) => tokens.add(prefix));
      }
      tokens.add(word);
    }

    const compact = words.join('');
    if (compact.length >= 2) {
      prefixes(compact).forEach((prefix) => tokens.add(prefix));
      tokens.add(compact);
    }
  }

  return Array.from(tokens).slice(0, 200);
}

export function queryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

export function getInactiveCutoff(now = new Date()) {
  return new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * MS_PER_DAY);
}

function zeroStockDateFilter(operator: '$gt' | '$lte', cutoff: Date) {
  const dateCondition = { [operator]: cutoff };
  const conditions: Record<string, unknown>[] = [
    { lastQuantityUpdatedAt: dateCondition },
    { lastQuantityUpdatedAt: null, createdAt: dateCondition },
  ];

  // Items with no quantity date or creation date use the Unix epoch in
  // getInventoryStockStatus, so they belong to the inactive group.
  if (operator === '$lte') {
    conditions.push({ lastQuantityUpdatedAt: null, createdAt: null });
  }

  return { $or: conditions };
}

export function getInventoryStatusFilter(status: string, now = new Date()): Record<string, unknown> {
  if (status === 'in-stock') {
    return { quantity: { $gt: LOW_STOCK_THRESHOLD } };
  }
  if (status === 'low-stock' || status === 'restock') {
    return { quantity: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } };
  }
  if (status === 'out-of-stock') {
    return {
      quantity: { $lte: 0 },
      $and: [zeroStockDateFilter('$gt', getInactiveCutoff(now))],
    };
  }
  if (status === 'inactive') {
    return {
      quantity: { $lte: 0 },
      $and: [zeroStockDateFilter('$lte', getInactiveCutoff(now))],
    };
  }
  return {};
}

export function getInventoryStockStatus(
  item: Pick<InventoryItem, 'quantity' | 'lastQuantityUpdatedAt' | 'createdAt'>,
  now = new Date()
): InventoryStockStatus {
  const quantity = item.quantity ?? 0;
  if (quantity > LOW_STOCK_THRESHOLD) return 'in-stock';
  if (quantity > 0) return 'low-stock';

  const quantityDate = item.lastQuantityUpdatedAt || item.createdAt || new Date(0);
  return quantityDate > getInactiveCutoff(now) ? 'out-of-stock' : 'inactive';
}

export function inventorySearchTokens(item: Partial<InventoryItem>): string[] {
  return buildSearchTokens(
    item.itemName,
    item.itemNumber,
    item.uniqueCode,
    item.brand,
    item.description,
    item.location,
    item.supplier
  );
}

export function entitySearchTokens(entity: {
  name?: string;
  phone?: string;
  email?: string;
  collectionType?: string;
}) {
  return buildSearchTokens(entity.name, entity.phone, entity.email, entity.collectionType);
}

export function invoiceSearchTokens(invoice: {
  invoiceNumber?: string;
  customerName?: string;
  customerPhone?: string;
}) {
  return buildSearchTokens(invoice.invoiceNumber, invoice.customerName, invoice.customerPhone);
}
