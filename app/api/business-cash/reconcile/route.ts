import { withRequestTiming } from '@/lib/request-timing';
import { NextRequest } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { confirmBusinessCash } from '@/lib/business-cash-commands';
import { businessCashFailure, businessCashResponse } from '@/lib/business-cash-http';

async function handlePOST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return businessCashResponse({ error: 'Unauthorized' }, 401);
    return businessCashResponse(await confirmBusinessCash('reconciliation', await request.json(), userId));
  } catch (error) { return businessCashFailure(error); }
}

export const POST = withRequestTiming('POST /api/business-cash/reconcile', handlePOST);
