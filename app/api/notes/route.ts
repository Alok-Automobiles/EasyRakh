import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import redis from '@/lib/redis';

const noteSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().optional(),
  color: z.string().min(1, 'Color is required'),
  isFavorite: z.boolean().optional().default(false),
  showOnDashboard: z.boolean().optional().default(false),
});

const colorPalette = ['#FFB347', '#FF6B6B', '#9B59B6', '#5DADE2', '#52BE80']; // orange, red-orange, purple, light blue, light green

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
    const notesCollection = db.collection('notes');

    const notes = await notesCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      notes: notes.map((note) => ({
        id: note._id.toString(),
        title: note.title,
        content: note.content || '',
        color: note.color,
        isFavorite: note.isFavorite || false,
        showOnDashboard: note.showOnDashboard || false,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Get notes error:', error);
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
    const validatedData = noteSchema.parse(body);

    if (!colorPalette.includes(validatedData.color)) {
      return NextResponse.json(
        { error: 'Invalid color. Color must be from the allowed palette.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const notesCollection = db.collection('notes');

    const now = new Date();
    const result = await notesCollection.insertOne({
      userId,
      title: validatedData.title,
      content: validatedData.content || '',
      color: validatedData.color,
      isFavorite: validatedData.isFavorite || false,
      showOnDashboard: validatedData.showOnDashboard || false,
      createdAt: now,
      updatedAt: now,
    });

    redis.del(`dashboard:stats:${userId}`).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

    return NextResponse.json(
      {
        message: 'Note created successfully',
        note: {
          id: result.insertedId.toString(),
          title: validatedData.title,
          content: validatedData.content || '',
          color: validatedData.color,
          isFavorite: validatedData.isFavorite || false,
          showOnDashboard: validatedData.showOnDashboard || false,
          createdAt: now,
          updatedAt: now,
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

    console.error('Create note error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

