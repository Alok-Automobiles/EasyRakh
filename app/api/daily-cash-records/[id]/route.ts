import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { format } from 'date-fns';
import redis from '@/lib/redis';

const updateEntrySchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  type: z.enum(['in', 'out']),
  description: z.string().min(1, 'Description is required'),
  date: z.string().min(1, 'Date is required'),
});

function parseDate(dateString: string): Date {
  if (dateString.includes('-') && dateString.split('-')[0].length <= 2) {
    try {
      const parts = dateString.split('-');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    } catch {
    }
  }
  try {
    const parts = dateString.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  } catch {
    throw new Error('Invalid date format. Use dd-mm-yyyy or YYYY-MM-DD');
  }
}

function normalizeDate(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
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

    const { id: entryId } = await params;
    const body = await request.json();
    const validatedData = updateEntrySchema.parse(body);

    const db = await getDb();
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');

    const parsedDate = parseDate(validatedData.date);
    const normalizedDate = normalizeDate(parsedDate);

    const record = await dailyCashRecordsCollection.findOne({
      userId,
      date: normalizedDate,
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Record not found for the specified date' },
        { status: 404 }
      );
    }

    const entryIndex = record.entries.findIndex(
      (entry: any) => entry._id.toString() === entryId
    );

    if (entryIndex === -1) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    const updatedEntries = [...record.entries];
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      amount: validatedData.amount,
      type: validatedData.type,
      description: validatedData.description,
      updatedAt: new Date(),
    };

    const totalIn = updatedEntries
      .filter((e: any) => e.type === 'in')
      .reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalOut = updatedEntries
      .filter((e: any) => e.type === 'out')
      .reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalLeft = totalIn - totalOut;

    await dailyCashRecordsCollection.updateOne(
      { _id: record._id },
      {
        $set: {
          entries: updatedEntries,
          totalIn,
          totalOut,
          totalLeft,
          updatedAt: new Date(),
        },
      }
    );

    const updatedRecord = await dailyCashRecordsCollection.findOne({
      _id: record._id,
    });

    if (!updatedRecord) {
      return NextResponse.json(
        { error: 'Failed to retrieve updated record' },
        { status: 500 }
      );
    }

    const dateKey = format(updatedRecord.date, 'dd-MM-yyyy');

    redis.del(
      `daily-cash:list:${userId}`,
      `daily-cash:date:${userId}:${dateKey}`,
      `dashboard:stats:${userId}`
    ).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

    return NextResponse.json({
      message: 'Entry updated successfully',
      record: {
        id: updatedRecord._id.toString(),
        date: dateKey,
        entries: updatedRecord.entries.map((entry: any) => ({
          id: entry._id.toString(),
          amount: entry.amount,
          type: entry.type,
          description: entry.description,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
        totalIn: updatedRecord.totalIn,
        totalOut: updatedRecord.totalOut,
        totalLeft: updatedRecord.totalLeft,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Update daily cash record error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

