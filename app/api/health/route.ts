import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check Redis
  try {
    const redisStart = Date.now();
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 5000)),
    ]);
    const redisLatency = Date.now() - redisStart;
    checks.redis = {
      status: pingResult === 'PONG' ? 'healthy' : 'unhealthy',
      latency: redisLatency,
    };
  } catch (error) {
    checks.redis = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check MongoDB
  try {
    const dbStart = Date.now();
    const db = await getDb();
    await Promise.race([
      db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB timeout')), 5000)),
    ]);
    const dbLatency = Date.now() - dbStart;
    checks.database = {
      status: 'healthy',
      latency: dbLatency,
    };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  const totalLatency = Date.now() - startTime;
  const overallStatus =
    checks.redis?.status === 'healthy' && checks.database?.status === 'healthy'
      ? 'healthy'
      : 'degraded';

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      latency: totalLatency,
    },
    {
      status: overallStatus === 'healthy' ? 200 : 503,
    }
  );
}

