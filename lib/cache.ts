import redis from './redis';
import { bumpCacheVersions } from './cache-version';

export const INVENTORY_LIST_TTL_SECONDS = 30;
export const INVENTORY_SUMMARY_TTL_SECONDS = 60;
export const INVENTORY_ITEM_TTL_SECONDS = 120;

export const inventoryListKey = (
  userId: string,
  params: { page: number; limit: number; status: string; search: string; version?: string }
) =>
  `inventory:list:${userId}:v${params.version || '0'}:p${params.page}:l${params.limit}:s${params.status}:q${encodeURIComponent(
    params.search
  )}`;

export const inventorySummaryKey = (userId: string, version = '0') =>
  `inventory:summary:${userId}:v${version}`;

export const inventoryItemKey = (userId: string, id: string) =>
  `inventory:item:${userId}:${id}`;

/**
 * Clear inventory list/summary caches and dashboard variants for the user.
 * Broad caches are versioned, so invalidation is O(1) instead of a Redis SCAN.
 */
export async function invalidateInventoryCache(
  userId: string,
  itemId?: string
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    bumpCacheVersions(userId, ['inventory', 'dashboard', 'search']),
  ];

  if (itemId) {
    tasks.push(redis.del(inventoryItemKey(userId, itemId)));
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Inventory cache invalidation failed:', result.reason);
    }
  }
}
