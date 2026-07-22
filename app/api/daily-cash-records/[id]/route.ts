import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { format } from 'date-fns';
import { ObjectId } from 'mongodb';
import { bumpCacheVersions } from '@/lib/cache-version';

const BILL_URL_MAX_LENGTH = 2048;
const ALLOWED_BILL_URL_SCHEMES = ['https:'];

const safeBillUrl = z
  .string()
  .max(BILL_URL_MAX_LENGTH, 'Bill URL is too long')
  .refine(
    (val) => {
      if (val === '') return true;
      try {
        const parsed = new URL(val);
        return ALLOWED_BILL_URL_SCHEMES.includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Bill URL must be a valid HTTPS URL' }
  );

const safeBillPublicId = z.string().max(512, 'Bill public ID is too long');

const updateEntrySchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  type: z.enum(['in', 'out']),
  description: z.string().min(1, 'Description is required'),
  date: z.string().min(1, 'Date is required'),
  billUrl: safeBillUrl.nullable().optional(),
  billPublicId: safeBillPublicId.nullable().optional(),
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

function calculateTotals(entries: any[]) {
  const totalIn = entries
    .filter((entry: any) => entry.type === 'in')
    .reduce((sum: number, entry: any) => sum + entry.amount, 0);
  const totalOut = entries
    .filter((entry: any) => entry.type === 'out')
    .reduce((sum: number, entry: any) => sum + entry.amount, 0);

  return {
    totalIn,
    totalOut,
    totalLeft: totalIn - totalOut,
  };
}

function serializeRecord(record: any) {
  return {
    id: record._id.toString(),
    date: format(record.date, 'dd-MM-yyyy'),
    entries: record.entries.map((entry: any) => ({
      id: entry._id.toString(),
      amount: entry.amount,
      type: entry.type,
      description: entry.description,
      billUrl: entry.billUrl || '',
      billPublicId: entry.billPublicId || '',
      source: entry.source || 'manual',
      invoiceId: entry.invoiceId,
      invoiceNumber: entry.invoiceNumber,
      paymentId: entry.paymentId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
    totalIn: record.totalIn,
    totalOut: record.totalOut,
    totalLeft: record.totalLeft,
  };
}

async function invalidateDailyCashCaches(userId: string, dateKey: string) {
  void dateKey;
  await bumpCacheVersions(userId, ['dailyCash', 'dashboard']);
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
    const existingEntry = updatedEntries[entryIndex];

    if (existingEntry.source === 'invoice_payment') {
      return NextResponse.json(
        { error: 'Invoice payment entries must be changed from the invoice payment history' },
        { status: 409 }
      );
    }

    const resolveBillField = (
      incoming: string | null | undefined,
      existing: string | undefined
    ): string => {
      if (incoming === undefined) return existing ?? '';
      if (incoming === null || incoming === '') return '';
      return incoming;
    };

    updatedEntries[entryIndex] = {
      ...existingEntry,
      amount: validatedData.amount,
      type: validatedData.type,
      description: validatedData.description,
      billUrl: resolveBillField(validatedData.billUrl, existingEntry.billUrl),
      billPublicId: resolveBillField(validatedData.billPublicId, existingEntry.billPublicId),
      updatedAt: new Date(),
    };

    const { totalIn, totalOut, totalLeft } = calculateTotals(updatedEntries);

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

    await invalidateDailyCashCaches(userId, dateKey);

    return NextResponse.json({
      message: 'Entry updated successfully',
      record: serializeRecord(updatedRecord),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
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

    const { id: entryId } = await params;

    if (!ObjectId.isValid(entryId)) {
      return NextResponse.json(
        { error: 'Invalid entry ID' },
        { status: 400 }
      );
    }

    const entryObjectId = new ObjectId(entryId);
    const db = await getDb();
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');

    const record = await dailyCashRecordsCollection.findOne({
      userId,
      'entries._id': entryObjectId,
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    const entryToDelete = record.entries.find(
      (entry: any) => entry._id.toString() === entryId
    );

    if (!entryToDelete) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }

    if (entryToDelete.source === 'invoice_payment') {
      return NextResponse.json(
        { error: 'Invoice payment entries must be deleted from the invoice payment history' },
        { status: 409 }
      );
    }

    const updatedEntries = record.entries.filter(
      (entry: any) => entry._id.toString() !== entryId
    );
    const dateKey = format(record.date, 'dd-MM-yyyy');

    try {
      const { cloudinaryAssetsFromFields, deleteCloudinaryAssets } = await import('@/lib/cloudinary-cleanup');
      await deleteCloudinaryAssets(
        cloudinaryAssetsFromFields({
          publicIds: [entryToDelete.billPublicId],
          urls: [entryToDelete.billUrl],
        })
      );
    } catch (error) {
      console.error('Failed to delete bill asset during daily cash entry delete:', error);
      return NextResponse.json(
        { error: 'Failed to delete associated uploaded files' },
        { status: 502 }
      );
    }

    if (updatedEntries.length === 0) {
      const result = await dailyCashRecordsCollection.deleteOne({
        _id: record._id,
        userId,
      });

      if (result.deletedCount === 0) {
        return NextResponse.json(
          { error: 'Entry not found' },
          { status: 404 }
        );
      }

      await invalidateDailyCashCaches(userId, dateKey);

      return NextResponse.json({
        message: 'Entry deleted successfully',
        record: null,
        deletedRecordId: record._id.toString(),
        date: dateKey,
      });
    }

    const { totalIn, totalOut, totalLeft } = calculateTotals(updatedEntries);

    await dailyCashRecordsCollection.updateOne(
      { _id: record._id, userId },
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
      userId,
    });

    if (!updatedRecord) {
      return NextResponse.json(
        { error: 'Failed to retrieve updated record' },
        { status: 500 }
      );
    }

    await invalidateDailyCashCaches(userId, dateKey);

    return NextResponse.json({
      message: 'Entry deleted successfully',
      record: serializeRecord(updatedRecord),
    });
  } catch (error) {
    console.error('Delete daily cash record entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
