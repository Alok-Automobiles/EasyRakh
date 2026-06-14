import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ObjectId } from 'mongodb';
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

    // Fetch user firm details
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
    const hasFirmDetails = firmTitle || gstNumber || firmPhone || firmEmail || firmAddress;

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
