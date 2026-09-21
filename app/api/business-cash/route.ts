import { NextRequest } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { supplierPaymentsEnabled } from '@/lib/supplier-payment-settings';
import { readBusinessCash } from '@/lib/business-cash';
import { changeProtectedCash, confirmBusinessCash } from '@/lib/business-cash-commands';
import { businessCashFailure, businessCashResponse } from '@/lib/business-cash-http';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return businessCashResponse({ error: 'Unauthorized' }, 401);
    if (!supplierPaymentsEnabled()) return businessCashResponse({ enabled: false, businessCash: null });
    return businessCashResponse({ enabled: true, businessCash: await readBusinessCash(await getDb(), userId) });
  } catch (error) { return businessCashFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return businessCashResponse({ error: 'Unauthorized' }, 401);
    const result = await confirmBusinessCash('opening', await request.json(), userId);
    return businessCashResponse(result, result.replayed ? 200 : 201);
  } catch (error) { return businessCashFailure(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return businessCashResponse({ error: 'Unauthorized' }, 401);
    return businessCashResponse(await changeProtectedCash(await request.json(), userId));
  } catch (error) { return businessCashFailure(error); }
}
