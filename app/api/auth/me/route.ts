import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { z } from 'zod';

const LAST_ACTIVE_WRITE_INTERVAL_MS = 15 * 60 * 1000;

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  firmTitle: z.string().optional(),
  gstNumber: z.string().optional(),
  firmPhone: z.string().optional(),
  firmEmail: z.string().email('Invalid email address').or(z.literal('')).optional(),
  firmAddress: z.string().optional(),
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

    const db = await getDb();
    const usersCollection = db.collection('users');

    const { ObjectId } = await import('mongodb');
    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const lastActiveAt = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
    const now = new Date();
    const shouldUpdateLastActive =
      !lastActiveAt ||
      !Number.isFinite(lastActiveAt.getTime()) ||
      now.getTime() - lastActiveAt.getTime() >= LAST_ACTIVE_WRITE_INTERVAL_MS;

    if (shouldUpdateLastActive) {
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { lastActiveAt: now } }
      );
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        isAdmin: isAdminEmail(user.email),
        firmTitle: user.firmTitle || '',
        gstNumber: user.gstNumber || '',
        firmPhone: user.firmPhone || '',
        firmEmail: user.firmEmail || '',
        firmAddress: user.firmAddress || '',
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = updateProfileSchema.parse(body);

    const db = await getDb();
    const usersCollection = db.collection('users');

    const { ObjectId } = await import('mongodb');

    const updateData: any = {
      name: validatedData.name,
      firmTitle: validatedData.firmTitle?.trim() || '',
      gstNumber: validatedData.gstNumber?.trim() || '',
      firmPhone: validatedData.firmPhone?.trim() || '',
      firmEmail: validatedData.firmEmail?.trim() || '',
      firmAddress: validatedData.firmAddress?.trim() || '',
      updatedAt: new Date(),
    };

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const updatedUser = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );

    return NextResponse.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser!._id.toString(),
        name: updatedUser!.name,
        email: updatedUser!.email,
        isAdmin: isAdminEmail(updatedUser!.email),
        firmTitle: updatedUser!.firmTitle || '',
        gstNumber: updatedUser!.gstNumber || '',
        firmPhone: updatedUser!.firmPhone || '',
        firmEmail: updatedUser!.firmEmail || '',
        firmAddress: updatedUser!.firmAddress || '',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
