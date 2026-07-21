import { describe, expect, it } from 'vitest';
import {
  getInventoryStatusFilter,
  getInventoryStockStatus,
} from '@/lib/search-normalization';

describe('inventory stock status', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');
  const inactiveCutoff = new Date('2026-05-22T12:00:00.000Z');

  it('classifies a zero-stock item as inactive once it reaches 60 days', () => {
    expect(
      getInventoryStockStatus(
        {
          quantity: 0,
          lastQuantityUpdatedAt: inactiveCutoff,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        now
      )
    ).toBe('inactive');
  });

  it('builds the inactive database filter from quantity age instead of stored status', () => {
    expect(getInventoryStatusFilter('inactive', now)).toEqual({
      quantity: { $lte: 0 },
      $and: [
        {
          $or: [
            { lastQuantityUpdatedAt: { $lte: inactiveCutoff } },
            {
              lastQuantityUpdatedAt: null,
              createdAt: { $lte: inactiveCutoff },
            },
            { lastQuantityUpdatedAt: null, createdAt: null },
          ],
        },
      ],
    });
  });

  it('keeps recently depleted items in out of stock', () => {
    expect(getInventoryStatusFilter('out-of-stock', now)).toEqual({
      quantity: { $lte: 0 },
      $and: [
        {
          $or: [
            { lastQuantityUpdatedAt: { $gt: inactiveCutoff } },
            {
              lastQuantityUpdatedAt: null,
              createdAt: { $gt: inactiveCutoff },
            },
          ],
        },
      ],
    });
  });
});
