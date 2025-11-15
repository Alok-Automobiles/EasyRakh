import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { format, parse, startOfDay } from 'date-fns';

const updateEntrySchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  type: z.enum(['in', 'out']),
  description: z.string().min(1, 'Description is required'),
  date: z.string().min(1, 'Date is required'),
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

    // Parse and normalize date
    const parsedDate = parseDate(validatedData.date);
    const normalizedDate = normalizeDate(parsedDate);

    // Find daily record by date and userId
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

    // Find entry by entryId
    const entryIndex = record.entries.findIndex(
      (entry: any) => entry._id.toString() === entryId
    );

    if (entryIndex === -1) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    // Update entry
    const updatedEntries = [...record.entries];
    updatedEntries[entryIndex] = {
      ...updatedEntries[entryIndex],
      amount: validatedData.amount,
      type: validatedData.type,
      description: validatedData.description,
      updatedAt: new Date(),
    };

    // Recalculate totals
    const totalIn = updatedEntries
      .filter((e: any) => e.type === 'in')
      .reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalOut = updatedEntries
      .filter((e: any) => e.type === 'out')
      .reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalLeft = totalIn - totalOut;

    // Update record in database
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

    // Fetch updated record
    const updatedRecord = await dailyCashRecordsCollection.findOne({
      _id: record._id,
    });

    return NextResponse.json({
      message: 'Entry updated successfully',
      record: {
        id: updatedRecord._id.toString(),
        date: format(updatedRecord.date, 'dd-MM-yyyy'),
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

