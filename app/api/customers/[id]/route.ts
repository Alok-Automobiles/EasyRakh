import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';

const customerSchema = z.object({
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
    const customersCollection = db.collection('customers');

    const customer = await customersCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      customer: {
        id: customer._id.toString(),
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        openingBalance: customer.openingBalance,
        balanceType: customer.balanceType,
        createdAt: customer.createdAt,
      },
    });
  } catch (error) {
    console.error('Get customer error:', error);
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
    const validatedData = customerSchema.parse(body);

    const db = await getDb();
    const customersCollection = db.collection('customers');

    const result = await customersCollection.updateOne(
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
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Customer updated successfully',
      customer: {
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

    console.error('Update customer error:', error);
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
    const customersCollection = db.collection('customers');
    const transactionsCollection = db.collection('transactions');

    // Check if customer has transactions
    const transactionCount = await transactionsCollection.countDocuments({
      customerId: id,
      userId,
    });

    if (transactionCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete customer with existing transactions' },
        { status: 400 }
      );
    }

    const result = await customersCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

