import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { format } from 'date-fns';
import redis, { deleteByPattern } from '@/lib/redis';

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

const entrySchema = z.object({
  amount: z.number().positive('Amount must be greater than 0'),
  type: z.enum(['in', 'out']),
  description: z.string().min(1, 'Description is required'),
  date: z.string().optional(),
  billUrl: safeBillUrl.optional(),
  billPublicId: safeBillPublicId.optional(),
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

async function invalidateDailyCashCaches(userId: string, dateKey: string) {
  const results = await Promise.allSettled([
    redis.del(
      `daily-cash:date:${userId}:${dateKey}`,
      `dashboard:stats:${userId}`
    ),
    deleteByPattern(`daily-cash:list:${userId}:page:*`),
    deleteByPattern(`dashboard:stats:${userId}:*`),
  ]);

  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn('Redis cache invalidation failed:', result.reason);
    }
  });
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
      const parsedDate = parseDate(dateParam);
      const normalizedDate = normalizeDate(parsedDate);
      const dateKey = format(normalizedDate, 'dd-MM-yyyy');

      try {
        const cacheKey = `daily-cash:date:${userId}:${dateKey}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Redis cache read failed, falling back to DB:', cacheError);
      }

      const record = await dailyCashRecordsCollection.findOne({
        userId,
        date: normalizedDate,
      });

      const responseData = !record
        ? {
            record: null,
            date: dateKey,
          }
        : {
            record: {
              id: record._id.toString(),
              date: format(record.date, 'dd-MM-yyyy'),
              entries: record.entries.map((entry: any) => ({
                id: entry._id.toString(),
                amount: entry.amount,
                type: entry.type,
                description: entry.description,
                billUrl: entry.billUrl || '',
                billPublicId: entry.billPublicId || '',
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt,
              })),
              totalIn: record.totalIn,
              totalOut: record.totalOut,
              totalLeft: record.totalLeft,
            },
            date: dateKey,
          };

      try {
        const cacheKey = `daily-cash:date:${userId}:${dateKey}`;
        await redis.setex(cacheKey, 300, JSON.stringify(responseData));
      } catch (cacheError) {
        console.warn('Redis cache write failed:', cacheError);
      }

      return NextResponse.json(responseData);
    } else {
      const pageParam = searchParams.get('page');
      const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
      const recordsPerPage = 7;
      const skip = (page - 1) * recordsPerPage;

      try {
        const cacheKey = `daily-cash:list:${userId}:page:${page}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached));
        }
      } catch (cacheError) {
        console.warn('Redis cache read failed, falling back to DB:', cacheError);
      }

      const totalRecords = await dailyCashRecordsCollection.countDocuments({ userId });

      const records = await dailyCashRecordsCollection
        .find({ userId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(recordsPerPage)
        .toArray();

      const totalPages = Math.ceil(totalRecords / recordsPerPage);

      const responseData = {
        records: records.map((record) => ({
          id: record._id.toString(),
          date: format(record.date, 'dd-MM-yyyy'),
          totalIn: record.totalIn,
          totalOut: record.totalOut,
          totalLeft: record.totalLeft,
          entryCount: record.entries?.length || 0,
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords,
          recordsPerPage,
        },
      };

      try {
        const cacheKey = `daily-cash:list:${userId}:page:${page}`;
        await redis.setex(cacheKey, 300, JSON.stringify(responseData));
      } catch (cacheError) {
        console.warn('Redis cache write failed:', cacheError);
      }

      return NextResponse.json(responseData);
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

    const entryDate = validatedData.date
      ? parseDate(validatedData.date)
      : new Date();
    const normalizedDate = normalizeDate(entryDate);

    let record = await dailyCashRecordsCollection.findOne({
      userId,
      date: normalizedDate,
    });

    const newEntry = {
      _id: new ObjectId(),
      amount: validatedData.amount,
      type: validatedData.type,
      description: validatedData.description,
      billUrl: validatedData.billUrl || '',
      billPublicId: validatedData.billPublicId || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dateKey = format(normalizedDate, 'dd-MM-yyyy');
    let responseRecord: {
      id: string;
      date: string;
      entries: any[];
      totalIn: number;
      totalOut: number;
      totalLeft: number;
    };

    if (!record) {
      const totalIn = validatedData.type === 'in' ? validatedData.amount : 0;
      const totalOut = validatedData.type === 'out' ? validatedData.amount : 0;
      const totalLeft = validatedData.type === 'in' ? validatedData.amount : -validatedData.amount;

      const result = await dailyCashRecordsCollection.insertOne({
        userId,
        date: normalizedDate,
        entries: [newEntry],
        totalIn,
        totalOut,
        totalLeft,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      responseRecord = {
        id: result.insertedId.toString(),
        date: dateKey,
        entries: [{
          id: newEntry._id.toString(),
          amount: newEntry.amount,
          type: newEntry.type,
          description: newEntry.description,
          billUrl: newEntry.billUrl,
          billPublicId: newEntry.billPublicId,
          createdAt: newEntry.createdAt,
          updatedAt: newEntry.updatedAt,
        }],
        totalIn,
        totalOut,
        totalLeft,
      };
    } else {
      const updatedEntries = [...record.entries, newEntry];
      
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

      responseRecord = {
        id: record._id.toString(),
        date: dateKey,
        entries: updatedEntries.map((entry: any) => ({
          id: entry._id.toString(),
          amount: entry.amount,
          type: entry.type,
          description: entry.description,
          billUrl: entry.billUrl || '',
          billPublicId: entry.billPublicId || '',
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
        totalIn,
        totalOut,
        totalLeft,
      };
    }

    await invalidateDailyCashCaches(userId, dateKey);

    return NextResponse.json(
      {
        message: 'Entry created successfully',
        record: responseRecord,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
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
