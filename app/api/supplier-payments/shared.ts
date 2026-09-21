import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { BusinessCashError } from '@/lib/business-cash';

export function supplierPaymentError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  if (error instanceof BusinessCashError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
  if (typeof error === 'object' && error && 'code' in error && error.code === 11000) return NextResponse.json({ error: 'Invoice or payment request already exists. Refresh and try again.' }, { status: 409 });
  console.error('Supplier payment error:', error);
  return NextResponse.json({ error: 'Unable to update supplier payments' }, { status: 500 });
}
