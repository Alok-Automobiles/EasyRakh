import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { z } from 'zod';
import { bumpCacheVersions, getCachedJson, requestCacheKey, setCachedJson } from '@/lib/cache-version';

const collectionTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
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

    const cacheKey = await requestCacheKey(request, 'collectionTypes', userId);
    const cached = await getCachedJson<{ collectionTypes: unknown[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');

    const collectionTypes = await collectionTypesCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const responseData = {
      collectionTypes: collectionTypes.map((ct) => ({
        id: ct._id.toString(),
        name: ct.name,
        slug: ct.slug,
        createdAt: ct.createdAt,
      })),
    };

    await setCachedJson(cacheKey, 600, responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get collection types error:', error);
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
    const validatedData = collectionTypeSchema.parse(body);

    const db = await getDb();
    const collectionTypesCollection = db.collection('collectionTypes');

    let slug = generateSlug(validatedData.name);
    let slugSuffix = 0;
    let finalSlug = slug;

    while (true) {
      const existing = await collectionTypesCollection.findOne({
        userId,
        slug: finalSlug,
      });

      if (!existing) {
        break;
      }

      slugSuffix++;
      finalSlug = `${slug}-${slugSuffix}`;
    }

    const result = await collectionTypesCollection.insertOne({
      userId,
      name: validatedData.name,
      slug: finalSlug,
      createdAt: new Date(),
    });

    await bumpCacheVersions(userId, ['collectionTypes', 'bootstrap']);

    return NextResponse.json(
      {
        message: 'Collection type created successfully',
        collectionType: {
          id: result.insertedId.toString(),
          name: validatedData.name,
          slug: finalSlug,
        },
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

    console.error('Create collection type error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
