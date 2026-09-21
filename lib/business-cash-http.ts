import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BusinessCashError } from './business-cash';

export function businessCashResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function businessCashFailure(error: unknown) {
  if (error instanceof z.ZodError) return businessCashResponse({ error: error.issues[0]?.message || 'Invalid request' }, 400);
  if (error instanceof BusinessCashError) return businessCashResponse({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return businessCashResponse({ error: 'Invalid JSON request' }, 400);
  console.error('Business cash request failed:', error);
  return businessCashResponse({ error: 'Unable to update business cash. Please try again.' }, 500);
}
