import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { InventoryItem } from '@/lib/types';

const LOW_STOCK_THRESHOLD = 5;
const INACTIVE_THRESHOLD_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STATUS_LABELS: Record<string, string> = {
  all: 'All Items',
  'in-stock': 'In Stock',
  'low-stock': 'Restock Items',
  'out-of-stock': 'Out of Stock Items',
  inactive: 'Inactive Items',
};

const supplierOrderSchema = z.object({
  mode: z.literal('order'),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1, 'Select at least one inventory item')
    .max(300, 'Supplier orders can include up to 300 items'),
});

function zeroStockDateCondition(operator: '$gt' | '$lte', cutoff: Date) {
  const dateCondition = { [operator]: cutoff };
  const conditions: Record<string, unknown>[] = [
    { lastQuantityUpdatedAt: dateCondition },
    { lastQuantityUpdatedAt: null, createdAt: dateCondition },
  ];

  if (operator === '$lte') {
    conditions.push({ lastQuantityUpdatedAt: null, createdAt: null });
  }

  return { $or: conditions };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getFirmDetails(db: Awaited<ReturnType<typeof getDb>>, userId: string) {
  const usersCollection = db.collection('users');
  const user = await usersCollection.findOne(
    { _id: new ObjectId(userId) },
    { projection: { firmTitle: 1, gstNumber: 1, firmPhone: 1, firmEmail: 1, firmAddress: 1 } }
  );

  const firmTitle = user?.firmTitle?.trim() || '';
  const gstNumber = user?.gstNumber?.trim() || '';
  const firmPhone = user?.firmPhone?.trim() || '';
  const firmEmail = user?.firmEmail?.trim() || '';
  const firmAddress = user?.firmAddress?.trim() || '';

  return {
    firmTitle,
    gstNumber,
    firmPhone,
    firmEmail,
    firmAddress,
    hasFirmDetails: Boolean(firmTitle || gstNumber || firmPhone || firmEmail || firmAddress),
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';

    const db = await getDb();
    const inventoryCollection = db.collection<InventoryItem>('inventory');

    const query: Record<string, unknown> = { userId };
    const inactiveCutoff = new Date(Date.now() - INACTIVE_THRESHOLD_DAYS * MS_PER_DAY);

    if (status === 'in-stock') {
      query.quantity = { $gt: LOW_STOCK_THRESHOLD };
    } else if (status === 'low-stock' || status === 'restock') {
      query.quantity = { $gt: 0, $lte: LOW_STOCK_THRESHOLD };
    } else if (status === 'out-of-stock') {
      query.quantity = { $lte: 0 };
      query.$and = [zeroStockDateCondition('$gt', inactiveCutoff)];
    } else if (status === 'inactive') {
      query.quantity = { $lte: 0 };
      query.$and = [zeroStockDateCondition('$lte', inactiveCutoff)];
    }

    const items = await inventoryCollection
      .find(query)
      .sort({ itemName: 1 })
      .toArray();

    const {
      firmTitle,
      gstNumber,
      firmPhone,
      firmEmail,
      firmAddress,
      hasFirmDetails,
    } = await getFirmDetails(db, userId);

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const primaryDark: [number, number, number] = [15, 23, 42];
    const grayText: [number, number, number] = [100, 116, 139];
    const borderColor: [number, number, number] = [226, 232, 240];
    const lightBg: [number, number, number] = [248, 250, 252];

    const headerHeight = hasFirmDetails ? 56 : 38;

    // Header background
    doc.setFillColor(...primaryDark);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    if (hasFirmDetails) {
      // Left: Firm details
      if (firmTitle) {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(firmTitle, margin, 16);
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const infoParts = [];
      if (gstNumber) infoParts.push(`GST: ${gstNumber}`);
      if (firmPhone) infoParts.push(`Phone: ${firmPhone}`);
      if (firmEmail) infoParts.push(`Email: ${firmEmail}`);
      if (infoParts.length) {
        doc.setTextColor(200, 210, 220);
        doc.text(infoParts.join('  |  '), margin, 26);
      }
      if (firmAddress) {
        doc.setTextColor(200, 210, 220);
        doc.text(firmAddress, margin, 34);
      }

      // Right: Report info
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Inventory Report', pageWidth - margin, 16, { align: 'right' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(STATUS_LABELS[status] || 'All Items', pageWidth - margin, 24, { align: 'right' });
      doc.setFontSize(8);
      doc.setTextColor(200, 210, 220);
      doc.text(`Generated on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, pageWidth - margin, 32, { align: 'right' });

      const countText = `${items.length} item${items.length !== 1 ? 's' : ''}`;
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      const textW = doc.getTextWidth(countText) + 8;
      doc.setFillColor(51, 65, 85);
      doc.roundedRect(pageWidth - margin - textW, headerHeight - 14, textW, 8, 2, 2, 'F');
      doc.text(countText, pageWidth - margin - textW + 4, headerHeight - 7.5);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Inventory Report', margin, 16);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(STATUS_LABELS[status] || 'All Items', margin, 24);

      doc.setFontSize(8);
      doc.setTextColor(200, 210, 220);
      doc.text(`Generated on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, margin, 32);

      const countText = `${items.length} item${items.length !== 1 ? 's' : ''}`;
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      const textW = doc.getTextWidth(countText) + 8;
      doc.setFillColor(51, 65, 85);
      doc.roundedRect(pageWidth - margin - textW, 12, textW, 8, 2, 2, 'F');
      doc.text(countText, pageWidth - margin - textW + 4, 17.5);
    }

    let cursorY = headerHeight + 8;

    if (items.length === 0) {
      doc.setTextColor(...grayText);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('No inventory items found for the selected filter.', pageWidth / 2, cursorY + 20, { align: 'center' });
    } else {
      const tableData = items.map((item, idx) => [
        (idx + 1).toString(),
        item.brand || '-',
        item.itemName,
        item.location || '-',
        (item.quantity ?? 0).toString(),
      ]);

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'Brand', 'Item Name', 'Location', 'Quantity']],
        body: tableData,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
          lineColor: borderColor,
          lineWidth: 0.1,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: lightBg,
          textColor: grayText,
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 30 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 30 },
          4: { cellWidth: 20, halign: 'center' },
        },
        alternateRowStyles: {
          fillColor: [252, 252, 253],
        },
      });

      cursorY = (doc as any).lastAutoTable.finalY + 6;

      // Summary row
      const totalQty = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
      doc.setFillColor(...primaryDark);
      doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Items: ${items.length}`, margin + 6, cursorY + 6.5);
      doc.text(`Total Quantity: ${totalQty}`, pageWidth - margin - 6, cursorY + 6.5, { align: 'right' });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...grayText);
      doc.setFont('helvetica', 'normal');
      doc.text('EasyRakh  |  Inventory Report', margin, pageHeight - 6);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    const pdfBuffer = doc.output('arraybuffer');
    const statusLabel = STATUS_LABELS[status] || 'All-Items';
    const fileName = `Inventory_Report_${statusLabel.replace(/\s+/g, '_')}_${format(new Date(), 'dd-MMM-yyyy')}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating inventory PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF report' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const payload = supplierOrderSchema.parse(body);
    const requestedIds = payload.items.map((item) => item.id);

    if (new Set(requestedIds).size !== requestedIds.length) {
      return NextResponse.json(
        { error: 'Duplicate inventory items are not allowed in one supplier order' },
        { status: 400 }
      );
    }

    if (requestedIds.some((id) => !ObjectId.isValid(id))) {
      return NextResponse.json({ error: 'Invalid inventory item selected' }, { status: 400 });
    }

    const db = await getDb();
    const inventoryCollection = db.collection<InventoryItem>('inventory');
    const objectIds = requestedIds.map((id) => new ObjectId(id));
    const quantityById = new Map(payload.items.map((item) => [item.id, item.quantity]));

    const inventoryItems = await inventoryCollection
      .find({ userId, _id: { $in: objectIds } } as Record<string, unknown>)
      .toArray();

    const inventoryById = new Map(
      inventoryItems.map((item) => [
        ((item as InventoryItem & { _id: ObjectId })._id).toString(),
        item,
      ])
    );

    const orderItems = requestedIds.map((id) => {
      const item = inventoryById.get(id);
      if (!item) return null;
      return {
        itemName: item.itemName || '-',
        itemNumber: item.itemNumber || item.uniqueCode || '-',
        brand: item.brand || '-',
        quantity: quantityById.get(id) || 0,
      };
    });

    if (orderItems.some((item) => item === null)) {
      return NextResponse.json(
        { error: 'Some selected items are no longer available' },
        { status: 400 }
      );
    }

    const {
      firmTitle,
      gstNumber,
      firmPhone,
      firmEmail,
      firmAddress,
    } = await getFirmDetails(db, userId);

    const generatedAt = new Date();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const black: [number, number, number] = [0, 0, 0];
    const muted: [number, number, number] = [70, 70, 70];

    doc.setTextColor(...black);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(firmTitle || 'Supplier Order', margin, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    const detailLines = [
      [gstNumber ? `GST: ${gstNumber}` : '', firmPhone ? `Phone: ${firmPhone}` : '', firmEmail ? `Email: ${firmEmail}` : '']
        .filter(Boolean)
        .join('  |  '),
      firmAddress,
    ].filter(Boolean);

    detailLines.forEach((line, index) => {
      doc.text(line, margin, 24 + index * 5);
    });

    doc.setTextColor(...black);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Supplier Order List', pageWidth - margin, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(format(generatedAt, 'dd MMM yyyy'), pageWidth - margin, 23, { align: 'right' });

    doc.setDrawColor(...black);
    doc.setLineWidth(0.2);
    doc.line(margin, 34, pageWidth - margin, 34);

    const tableData = (orderItems as NonNullable<(typeof orderItems)[number]>[]).map((item, idx) => [
      (idx + 1).toString(),
      item.itemName,
      item.itemNumber,
      item.brand,
      item.quantity.toString(),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['#', 'Item Name', 'SKU', 'Brand', 'Qty to Order']],
      body: tableData,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8.5,
        cellPadding: 2.4,
        lineColor: black,
        lineWidth: 0.1,
        textColor: black,
        fillColor: [255, 255, 255],
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: black,
        fontStyle: 'bold',
        lineColor: black,
        lineWidth: 0.15,
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 34 },
        3: { cellWidth: 34 },
        4: { cellWidth: 24, halign: 'center' },
      },
    });

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'normal');
      doc.text('EasyRakh  |  Supplier Order', margin, pageHeight - 6);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    const pdfBuffer = doc.output('arraybuffer');
    const fileName = `supplier-order-${format(generatedAt, 'yyyy-MM-dd')}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid order payload' }, { status: 400 });
    }

    console.error('Error generating supplier order PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate supplier order PDF' },
      { status: 500 }
    );
  }
}
