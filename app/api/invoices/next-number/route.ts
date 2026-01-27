import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const invoicesCollection = db.collection('invoices');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}-${month}-`;

    const latestInvoice = await invoicesCollection
      .find({
        userId,
        invoiceNumber: { $regex: `^${prefix}` },
      })
      .sort({ invoiceNumber: -1 })
      .limit(1)
      .toArray();

    let nextNumber = 1;
    if (latestInvoice.length > 0) {
      const lastNumber = latestInvoice[0].invoiceNumber;
      const lastSeq = parseInt(lastNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) {
        nextNumber = lastSeq + 1;
      }
    }

    const nextInvoiceNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;

    return NextResponse.json({ nextInvoiceNumber });
  } catch (error) {
    console.error('Get next invoice number error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
