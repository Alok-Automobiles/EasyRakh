import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const startTime = Date.now();
    
    // Test MongoDB connection
    const db = await getDb();
    await Promise.race([
      db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB timeout')), 5000)),
    ]);
    const responseTime = Date.now() - startTime;

    // Get database stats
    const stats = await db.stats();
    const collections = await db.listCollections().toArray();

    return NextResponse.json({
      status: 'healthy',
      database: {
        name: db.databaseName,
        responseTime: `${responseTime}ms`,
        collections: collections.length,
        dataSize: `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`,
        storageSize: `${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

