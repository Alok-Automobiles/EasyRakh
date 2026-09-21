import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import { reserveSupplierPayment } from '@/lib/supplier-payments';
import { supplierPaymentsEnabled } from '@/lib/supplier-payment-settings';
import { supplierPaymentError } from '../shared';

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!supplierPaymentsEnabled()) return NextResponse.json({ error: 'Supplier payments are disabled' }, { status: 404 });
  try { return NextResponse.json(await reserveSupplierPayment(userId, await request.json())); }
  catch (error) { return supplierPaymentError(error); }
}
