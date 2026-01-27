import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import redis from '@/lib/redis';

const collectionTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
    const collectionTypesCollection = db.collection('collectionTypes');

    const collectionType = await collectionTypesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!collectionType) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      collectionType: {
        id: collectionType._id.toString(),
        name: collectionType.name,
        slug: collectionType.slug,
        createdAt: collectionType.createdAt,
      },
    });
  } catch (error) {
    console.error('Get collection type error:', error);
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
    const validatedData = collectionTypeSchema.parse(body);

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');

    const existing = await collectionTypesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    let slug = generateSlug(validatedData.name);
    let slugSuffix = 0;
    let finalSlug = slug;

    while (true) {
      const duplicate = await collectionTypesCollection.findOne({
        userId,
        slug: finalSlug,
        _id: { $ne: new ObjectId(id) },
      });

      if (!duplicate) {
        break;
      }

      slugSuffix++;
      finalSlug = `${slug}-${slugSuffix}`;
    }

    const result = await collectionTypesCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId,
      },
      {
        $set: {
          name: validatedData.name,
          slug: finalSlug,
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    const pattern = `customEntities:${existing.slug}:${userId}`;
    redis.del(`collectionTypes:${userId}`, pattern).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

    return NextResponse.json({
      message: 'Collection type updated successfully',
      collectionType: {
        id: id,
        name: validatedData.name,
        slug: finalSlug,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Update collection type error:', error);
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
    const collectionTypesCollection = db.collection('collectionTypes');
    const customEntitiesCollection = db.collection('customEntities');

    const collectionType = await collectionTypesCollection.findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!collectionType) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    const entityCount = await customEntitiesCollection.countDocuments({
      userId,
      collectionType: collectionType.slug,
    });

    if (entityCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete collection type with existing entities' },
        { status: 400 }
      );
    }

    const result = await collectionTypesCollection.deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Collection type not found' },
        { status: 404 }
      );
    }

    redis.del(`collectionTypes:${userId}`).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

    return NextResponse.json({
      message: 'Collection type deleted successfully',
    });
  } catch (error) {
    console.error('Delete collection type error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

