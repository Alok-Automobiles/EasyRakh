import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { format, parse, startOfDay, subDays } from 'date-fns';

const entrySchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  type: z.enum(['in', 'out']),
  description: z.string().min(1, 'Description is required'),
  date: z.string().optional(),
});

// Helper function to parse date from dd-mm-yyyy or YYYY-MM-DD format
function parseDate(dateString: string): Date {
  // Try dd-mm-yyyy format first
  if (dateString.includes('-') && dateString.split('-')[0].length <= 2) {
    try {
      return parse(dateString, 'dd-MM-yyyy', new Date());
    } catch {
      // Fall through to try YYYY-MM-DD
    }
  }
  // Try YYYY-MM-DD format
  try {
    return parse(dateString, 'yyyy-MM-dd', new Date());
  } catch {
    throw new Error('Invalid date format. Use dd-mm-yyyy or YYYY-MM-DD');
  }
}

// Helper function to normalize date to start of day
function normalizeDate(date: Date): Date {
  return startOfDay(date);
}

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
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    if (dateParam) {
      // Get specific date record
      const parsedDate = parseDate(dateParam);
      const normalizedDate = normalizeDate(parsedDate);

      const record = await dailyCashRecordsCollection.findOne({
        userId,
        date: normalizedDate,
      });

      if (!record) {
        return NextResponse.json({
          record: null,
          date: format(normalizedDate, 'dd-MM-yyyy'),
        });
      }

      return NextResponse.json({
        record: {
          id: record._id.toString(),
          date: format(record.date, 'dd-MM-yyyy'),
          entries: record.entries.map((entry: any) => ({
            id: entry._id.toString(),
            amount: entry.amount,
            type: entry.type,
            description: entry.description,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          })),
          totalIn: record.totalIn,
          totalOut: record.totalOut,
          totalLeft: record.totalLeft,
        },
        date: format(normalizedDate, 'dd-MM-yyyy'),
      });
    } else {
      // Get last 7 days records
      const today = normalizeDate(new Date());
      const sevenDaysAgo = normalizeDate(subDays(today, 6));

      const records = await dailyCashRecordsCollection
        .find({
          userId,
          date: { $gte: sevenDaysAgo, $lte: today },
        })
        .sort({ date: -1 })
        .toArray();

      return NextResponse.json({
        records: records.map((record) => ({
          id: record._id.toString(),
          date: format(record.date, 'dd-MM-yyyy'),
          totalIn: record.totalIn,
          totalOut: record.totalOut,
          totalLeft: record.totalLeft,
          entryCount: record.entries?.length || 0,
        })),
      });
    }
  } catch (error) {
    console.error('Get daily cash records error:', error);
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
    const validatedData = entrySchema.parse(body);

    const db = await getDb();
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');

    // Parse and normalize date
    const entryDate = validatedData.date
      ? parseDate(validatedData.date)
      : new Date();
    const normalizedDate = normalizeDate(entryDate);

    // Find or create daily record
    let record = await dailyCashRecordsCollection.findOne({
      userId,
      date: normalizedDate,
    });

    const newEntry = {
      _id: new ObjectId(),
      amount: validatedData.amount,
      type: validatedData.type,
      description: validatedData.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!record) {
      // Create new record
      const result = await dailyCashRecordsCollection.insertOne({
        userId,
        date: normalizedDate,
        entries: [newEntry],
        totalIn: validatedData.type === 'in' ? validatedData.amount : 0,
        totalOut: validatedData.type === 'out' ? validatedData.amount : 0,
        totalLeft: validatedData.type === 'in' ? validatedData.amount : -validatedData.amount,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      record = await dailyCashRecordsCollection.findOne({
        _id: result.insertedId,
      });
    } else {
      // Update existing record
      const updatedEntries = [...record.entries, newEntry];
      
      // Recalculate totals
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

      record = await dailyCashRecordsCollection.findOne({
        _id: record._id,
      });
    }

    if (!record) {
      return NextResponse.json(
        { error: 'Failed to retrieve record after creation/update' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Entry created successfully',
        record: {
          id: record._id.toString(),
          date: format(record.date, 'dd-MM-yyyy'),
          entries: record.entries.map((entry: any) => ({
            id: entry._id.toString(),
            amount: entry.amount,
            type: entry.type,
            description: entry.description,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          })),
          totalIn: record.totalIn,
          totalOut: record.totalOut,
          totalLeft: record.totalLeft,
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

    console.error('Create daily cash record error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

