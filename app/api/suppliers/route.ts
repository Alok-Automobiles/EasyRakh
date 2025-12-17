import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to get from cache
    try {
      const cacheKey = `suppliers:${userId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    } catch (cacheError) {
      // If Redis fails, continue to DB query
      console.warn('Redis cache read failed, falling back to DB:', cacheError);
    }

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');
    const transactionsCollection = db.collection('transactions');

    const suppliers = await suppliersCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    // Calculate total balance for each supplier
    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (supplier) => {
        const supplierId = supplier._id.toString();
        
        // Get all transactions for this supplier
        const transactions = await transactionsCollection
          .find({
            entityId: supplierId,
            entityType: 'supplier',
            userId,
          })
          .toArray();

        // Calculate totals
        const totalCredit = transactions
          .filter((t) => t.type === 'credit')
          .reduce((sum, t) => sum + t.amount, 0);
        const totalDebit = transactions
          .filter((t) => t.type === 'debit')
          .reduce((sum, t) => sum + t.amount, 0);

        // Calculate final balance
        let totalBalance = supplier.openingBalance;
        if (supplier.balanceType === 'credit') {
          totalBalance = -totalBalance;
        }
        totalBalance = totalBalance - totalCredit + totalDebit;

        return {
          id: supplierId,
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email,
          address: supplier.address,
          openingBalance: supplier.openingBalance,
          balanceType: supplier.balanceType,
          totalBalance,
          createdAt: supplier.createdAt,
        };
      })
    );

    const responseData = {
      suppliers: suppliersWithBalance,
    };

    // Cache the response with 5 minute TTL
    try {
      const cacheKey = `suppliers:${userId}`;
      await redis.setex(cacheKey, 300, JSON.stringify(responseData));
    } catch (cacheError) {
      // If Redis fails, continue without caching
      console.warn('Redis cache write failed:', cacheError);
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get suppliers error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = supplierSchema.parse(body);

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');

    const result = await suppliersCollection.insertOne({
      userId,
      name: validatedData.name,
      phone: validatedData.phone || '',
      email: validatedData.email || '',
      address: validatedData.address || '',
      openingBalance: validatedData.openingBalance,
      balanceType: validatedData.balanceType,
      createdAt: new Date(),
    });

    // Invalidate related caches
    try {
      await redis.del(`suppliers:${userId}`, `dashboard:stats:${userId}`);
    } catch (cacheError) {
      console.warn('Redis cache invalidation failed:', cacheError);
    }

    return NextResponse.json(
      {
        message: 'Supplier created successfully',
        supplier: {
          id: result.insertedId.toString(),
          ...validatedData,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Create supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

