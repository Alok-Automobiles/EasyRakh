import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');

    const supplier = await suppliersCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      supplier: {
        id: supplier._id.toString(),
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        openingBalance: supplier.openingBalance,
        balanceType: supplier.balanceType,
        createdAt: supplier.createdAt,
      },
    });
  } catch (error) {
    console.error('Get supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = supplierSchema.parse(body);

    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');

    const result = await suppliersCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId,
      },
      {
        $set: {
          name: validatedData.name,
          phone: validatedData.phone || '',
          email: validatedData.email || '',
          address: validatedData.address || '',
          openingBalance: validatedData.openingBalance,
          balanceType: validatedData.balanceType,
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Supplier updated successfully',
      supplier: {
        id: id,
        ...validatedData,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Update supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = await getDb();
    const suppliersCollection = db.collection('suppliers');
    const transactionsCollection = db.collection('transactions');

    // Check if supplier has transactions
    const transactionCount = await transactionsCollection.countDocuments({
      entityId: id,
      entityType: 'supplier',
      userId,
    });

    if (transactionCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete supplier with existing transactions' },
        { status: 400 }
      );
    }

    const result = await suppliersCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    console.error('Delete supplier error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

