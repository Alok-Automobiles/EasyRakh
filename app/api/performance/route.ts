import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import redis from '@/lib/redis';
import { timingBucket, validatePerformanceEvent } from '@/lib/performance-metrics';
import { createApiTimer } from '@/lib/performance-timing';

const MAX_EVENTS = 20;
const MAX_BODY_BYTES = 12_000;
const RATE_LIMIT_PER_MINUTE = 30;
const RETENTION_DAYS = 8;

let indexesReady: Promise<void> | null = null;

function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = getDb().then(async (db) => {
      const collection = db.collection('performanceDaily');
      await Promise.all([
        collection.createIndex(
          { day: 1, route: 1, kind: 1, metric: 1, cacheResult: 1, status: 1, device: 1, surface: 1, country: 1 },
          { unique: true, name: 'performance_daily_group' }
        ),
        collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'performance_daily_ttl' }),
      ]);
    }).catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

function countryFromRequest(request: NextRequest): 'IN' | 'OTHER' | 'UNKNOWN' {
  const country = request.headers.get('x-vercel-ip-country');
  if (!country) return 'UNKNOWN';
  return country.toUpperCase() === 'IN' ? 'IN' : 'OTHER';
}

async function rateLimit(userId: string): Promise<boolean> {
  // The transient Redis key is pseudonymous. No account identifier reaches the
  // telemetry collection or reporting responses.
  const digest = createHmac('sha256', process.env.JWT_SECRET || '')
    .update(userId).digest('hex').slice(0, 24);
  const key = `performance:rate:${digest}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 65);
  return count <= RATE_LIMIT_PER_MINUTE;
}

export async function POST(request: NextRequest) {
  const timer = createApiTimer(request);
  const respond = (body: unknown, status: number) => timer.finish(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  );
  const userId = getUserIdFromRequest(request);
  if (!userId) return respond({ error: 'Unauthorized' }, 401);

  try {
    const allowed = await timer.measure('redis', () => rateLimit(userId));
    if (!allowed) return respond({ error: 'Too many reports' }, 429);
  } catch {
    // Fail closed for this background-only endpoint if Redis cannot enforce
    // its limit; ordinary app actions are unaffected.
    return respond({ error: 'Timing reports temporarily unavailable' }, 503);
  }

  const advertisedSize = Number(request.headers.get('content-length') || '0');
  if (advertisedSize > MAX_BODY_BYTES) return respond({ error: 'Report too large' }, 413);

  try {
    const bodyText = await request.text();
    if (bodyText.length > MAX_BODY_BYTES) return respond({ error: 'Report too large' }, 413);
    const parsed: unknown = JSON.parse(bodyText);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_EVENTS) {
      return respond({ error: 'Invalid report' }, 400);
    }
    const events = parsed.map(validatePerformanceEvent);
    if (events.some((event) => event === null)) return respond({ error: 'Invalid report' }, 400);

    await ensureIndexes();
    const db = await getDb();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const country = countryFromRequest(request);
    const operations = events.map((event) => {
      const valid = event!;
      const filter = {
        day, route: valid.route, kind: valid.kind, metric: valid.metric,
        cacheResult: valid.cacheResult || 'NA', status: valid.status,
        device: valid.device, surface: valid.surface, country,
      };
      return {
        updateOne: {
          filter,
          update: {
            $inc: { count: 1, totalMs: Math.round(valid.durationMs), [`histogram.b${timingBucket(valid.durationMs)}`]: 1 },
            $set: { updatedAt: now, expiresAt },
          },
          upsert: true,
        },
      };
    });
    await timer.measure('mongodb', () => db.collection('performanceDaily').bulkWrite(operations, { ordered: false }));
    return respond({ accepted: events.length }, 202);
  } catch (error) {
    console.error('Performance report failed:', error);
    return respond({ error: 'Timing report failed' }, 500);
  }
}
