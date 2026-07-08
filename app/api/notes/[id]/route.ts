import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { bumpCacheVersions } from '@/lib/cache-version';

const updateNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  content: z.string().optional(),
  color: z.string().min(1, 'Color is required').optional(),
  isFavorite: z.boolean().optional(),
  showOnDashboard: z.boolean().optional(),
});

const colorPalette = ['#FFB347', '#FF6B6B', '#9B59B6', '#5DADE2', '#52BE80']; // orange, red-orange, purple, light blue, light green

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
    const validatedData = updateNoteSchema.parse(body);

    if (validatedData.color && !colorPalette.includes(validatedData.color)) {
      return NextResponse.json(
        { error: 'Invalid color. Color must be from the allowed palette.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const notesCollection = db.collection('notes');

    const note = await notesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    const updateData: {
      title?: string;
      content?: string;
      color?: string;
      isFavorite?: boolean;
      showOnDashboard?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (validatedData.title !== undefined) {
      updateData.title = validatedData.title;
    }
    if (validatedData.content !== undefined) {
      updateData.content = validatedData.content;
    }
    if (validatedData.color !== undefined) {
      updateData.color = validatedData.color;
    }
    if (validatedData.isFavorite !== undefined) {
      updateData.isFavorite = validatedData.isFavorite;
    }
    if (validatedData.showOnDashboard !== undefined) {
      updateData.showOnDashboard = validatedData.showOnDashboard;
    }

    await notesCollection.updateOne(
      { _id: new ObjectId(id), userId },
      { $set: updateData }
    );

    const updatedNote = await notesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    await bumpCacheVersions(userId, ['dashboard']);

    return NextResponse.json({
      message: 'Note updated successfully',
      note: {
        id: updatedNote!._id.toString(),
        title: updatedNote!.title,
        content: updatedNote!.content || '',
        color: updatedNote!.color,
        isFavorite: updatedNote!.isFavorite || false,
        showOnDashboard: updatedNote!.showOnDashboard || false,
        createdAt: updatedNote!.createdAt,
        updatedAt: updatedNote!.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error('Update note error:', error);
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
    const notesCollection = db.collection('notes');

    const note = await notesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    await notesCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    await bumpCacheVersions(userId, ['dashboard']);

    return NextResponse.json({
      message: 'Note deleted successfully',
    });
  } catch (error) {
    console.error('Delete note error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
