import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import type { InventoryItem } from '@/lib/types';
import { normalizeIdentifier } from '@/lib/search-normalization';

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
    const itemNumber = (searchParams.get('itemNumber') || '').trim();
    const limitParam = Number(searchParams.get('limit') || '8');
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 10)
      : 8;

    if (!itemNumber) {
      return NextResponse.json({ items: [] });
    }

    const db = await getDb();
    const inventoryCollection = db.collection<InventoryItem>('inventory');
    const regex = { $regex: `^${escapeRegex(normalizeIdentifier(itemNumber))}` };

    const items = await inventoryCollection
      .find(
        {
          userId,
          itemNumberKey: regex,
        },
        {
          projection: {
            _id: 1,
            itemNumber: 1,
            itemName: 1,
            quantity: 1,
            unitOfMeasure: 1,
          },
        }
      )
      .sort({ itemNumber: 1, updatedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      items: items.map((item) => ({
        id: item._id!.toString(),
        itemNumber: item.itemNumber || '',
        itemName: item.itemName,
        quantity: item.quantity || 0,
        unitOfMeasure: item.unitOfMeasure || '',
      })),
    });
  } catch (error) {
    console.error('Inventory suggestions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
