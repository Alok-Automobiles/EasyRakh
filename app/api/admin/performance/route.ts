import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getDb } from '@/lib/mongodb';
import { percentileUpperBound } from '@/lib/performance-metrics';
import { createApiTimer } from '@/lib/performance-timing';

interface TimingSummaryDoc {
  day: string;
  route: string;
  kind: string;
  metric: string;
  cacheResult: string;
  status: string;
  device: string;
  surface: string;
  country: string;
  count: number;
  totalMs: number;
  histogram?: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const timer = createApiTimer(request);
  const respond = (body: unknown, status: number) => timer.finish(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  );
  const userId = getUserIdFromRequest(request);
  if (!userId || !ObjectId.isValid(userId)) return respond({ error: 'Unauthorized' }, 401);

  try {
    const db = await getDb();
    const user = await timer.measure('mongodb', () => db.collection('users').findOne(
      { _id: new ObjectId(userId) }, { projection: { email: 1 } }
    ));
    if (!user || !isAdminEmail(user.email as string)) return respond({ error: 'Forbidden' }, 403);

    const requestedDays = Number(request.nextUrl.searchParams.get('days') || '7');
    if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 7) {
      return respond({ error: 'days must be between 1 and 7' }, 400);
    }
    const country = request.nextUrl.searchParams.get('country') || 'IN';
    const device = request.nextUrl.searchParams.get('device') || 'mobile';
    const surface = request.nextUrl.searchParams.get('surface') || 'pwa';
    if (!['IN', 'OTHER', 'UNKNOWN', 'ALL'].includes(country) ||
      !['mobile', 'desktop', 'ALL'].includes(device) ||
      !['pwa', 'browser', 'ALL'].includes(surface)) {
      return respond({ error: 'Invalid group filter' }, 400);
    }
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - requestedDays + 1);
    const filter: Record<string, unknown> = { day: { $gte: start.toISOString().slice(0, 10) } };
    if (country !== 'ALL') filter.country = country;
    if (device !== 'ALL') filter.device = device;
    if (surface !== 'ALL') filter.surface = surface;

    const docs = await timer.measure('mongodb', () => db.collection<TimingSummaryDoc>('performanceDaily')
      .find(filter, { projection: { _id: 0 } }).limit(20_000).toArray());
    const groups = new Map<string, {
      route: string; kind: string; metric: string; cacheResult: string; status: string;
      count: number; totalMs: number; histogram: Record<string, number>;
    }>();
    for (const doc of docs) {
      const key = `${doc.route}|${doc.kind}|${doc.metric}|${doc.cacheResult}|${doc.status}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          route: doc.route, kind: doc.kind, metric: doc.metric,
          cacheResult: doc.cacheResult, status: doc.status,
          count: 0, totalMs: 0, histogram: {},
        };
        groups.set(key, group);
      }
      group.count += doc.count;
      group.totalMs += doc.totalMs;
      for (const [bucket, count] of Object.entries(doc.histogram || {})) {
        group.histogram[bucket] = (group.histogram[bucket] || 0) + count;
      }
    }
    const results = Array.from(groups.values(), (group) => ({
      route: group.route,
      kind: group.kind,
      metric: group.metric,
      cacheResult: group.cacheResult === 'NA' ? null : group.cacheResult,
      status: group.status,
      count: group.count,
      meanMs: group.count ? Math.round(group.totalMs / group.count) : null,
      p50UpperMs: percentileUpperBound(group.histogram, 0.5),
      p95UpperMs: percentileUpperBound(group.histogram, 0.95),
    })).sort((a, b) => a.route.localeCompare(b.route) || a.kind.localeCompare(b.kind));
    return respond({
      days: requestedDays,
      country,
      device,
      surface,
      sampleRate: 0.1,
      percentilesAreBucketUpperBounds: true,
      results,
    }, 200);
  } catch (error) {
    console.error('Performance report query failed:', error);
    return respond({ error: 'Unable to load timing report' }, 500);
  }
}
