import redis, { deleteByPattern } from './redis';

export const INVENTORY_LIST_TTL_SECONDS = 30;
export const INVENTORY_SUMMARY_TTL_SECONDS = 60;
export const INVENTORY_ITEM_TTL_SECONDS = 120;

export const inventoryListKey = (
  userId: string,
  params: { page: number; limit: number; status: string; search: string }
) =>
  `inventory:list:${userId}:p${params.page}:l${params.limit}:s${params.status}:q${encodeURIComponent(
    params.search
  )}`;

export const inventorySummaryKey = (userId: string) =>
  `inventory:summary:${userId}`;

export const inventoryItemKey = (userId: string, id: string) =>
  `inventory:item:${userId}:${id}`;

/**
 * Clear inventory caches and ALL dashboard:stats variants for the user.
 *
 * Why a pattern delete for dashboard:stats: the dashboard route caches both a
 * base key (`dashboard:stats:${userId}`) and per-period keys
 * (`dashboard:stats:${userId}:YYYY-MM`, `dashboard:stats:${userId}:from-to`).
 * Plain `redis.del('dashboard:stats:${userId}')` only clears the base key, so
 * period-scoped views could show stale inventory data until the 5-min TTL
 * expires. SCAN clears every variant.
 */
export async function invalidateInventoryCache(
  userId: string,
  itemId?: string
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    deleteByPattern(`inventory:list:${userId}:*`),
    deleteByPattern(`dashboard:stats:${userId}*`),
    redis.del(inventorySummaryKey(userId)),
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
