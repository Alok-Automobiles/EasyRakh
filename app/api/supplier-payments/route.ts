import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { getSupplierPaymentSummary, supplierDateSchema, supplierIdSchema } from '@/lib/supplier-payments';
import { supplierPaymentsEnabled } from '@/lib/supplier-payment-settings';
import { supplierPaymentError } from './shared';

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!supplierPaymentsEnabled()) return NextResponse.json({ error: 'Supplier payments are disabled' }, { status: 404 });
  try {
    const params = request.nextUrl.searchParams;
    const date = params.has('date') ? supplierDateSchema.parse(params.get('date')) : undefined;
    const supplierId = params.has('supplierId') ? supplierIdSchema.parse(params.get('supplierId')) : undefined;
    return NextResponse.json(await getSupplierPaymentSummary(await getDb(), userId, { date, supplierId }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return supplierPaymentError(error); }
}
