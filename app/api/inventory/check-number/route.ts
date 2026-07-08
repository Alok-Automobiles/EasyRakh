import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import type { InventoryItem } from '@/lib/types';
import { normalizeIdentifier } from '@/lib/search-normalization';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const itemNumber = (searchParams.get('itemNumber') || '').trim().toUpperCase();
    const excludeId = (searchParams.get('excludeId') || '').trim();

    if (!itemNumber) {
      return NextResponse.json({ exists: false });
    }

    const db = await getDb();
    const inventoryCollection = db.collection<InventoryItem>('inventory');

    const query: Record<string, unknown> = {
      userId,
      itemNumberKey: normalizeIdentifier(itemNumber),
    };

    if (excludeId && ObjectId.isValid(excludeId)) {
      query._id = { $ne: new ObjectId(excludeId) };
    }

    const existing = await inventoryCollection.findOne(query, {
      projection: { _id: 1, itemName: 1, itemNumber: 1 },
    });

    if (!existing) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      item: {
        id: existing._id.toString(),
        itemName: existing.itemName,
        itemNumber: existing.itemNumber,
      },
    });
  } catch (error) {
    console.error('Check item number error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
