import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function parseInputDate(dateString: string): Date {
  // Accepts YYYY-MM-DD
  const parts = dateString.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  return `${amount < 0 ? '-' : ''}Rs. ${formatted}`;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    if (!fromParam || !toParam) {
      return NextResponse.json(
        { error: 'Both "from" and "to" date parameters are required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const fromDate = parseInputDate(fromParam);
    const toDate = parseInputDate(toParam);

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: '"from" date must be before or equal to "to" date' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');

    const records = await dailyCashRecordsCollection
      .find({
        userId,
        date: { $gte: fromDate, $lte: toDate },
      })
      .sort({ date: 1 })
      .toArray();

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Colors
    const primaryDark = [15, 23, 42] as [number, number, number];     // slate-900
    const greenDark = [21, 128, 61] as [number, number, number];      // green-700
    const redDark = [185, 28, 28] as [number, number, number];        // red-700
    const grayText = [100, 116, 139] as [number, number, number];     // slate-500
    const lightBg = [248, 250, 252] as [number, number, number];      // slate-50
    const borderColor = [226, 232, 240] as [number, number, number];  // slate-200

    // ═══════════════════ HEADER SECTION ═══════════════════
    // Draw header background
    doc.setFillColor(...primaryDark);
    doc.rect(0, 0, pageWidth, 38, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Daily Cash Record Report', margin, 16);

    // Subtitle with date range
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const fromLabel = format(fromDate, 'dd MMM yyyy');
    const toLabel = format(toDate, 'dd MMM yyyy');
    doc.text(`${fromLabel}  -  ${toLabel}`, margin, 24);

    // Generated date
    doc.setFontSize(8);
    doc.setTextColor(200, 210, 220);
    doc.text(`Generated on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, margin, 32);

    // Total records badge
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const recordsText = `${records.length} day${records.length !== 1 ? 's' : ''}`;
    const textW = doc.getTextWidth(recordsText) + 8;
    doc.setFillColor(51, 65, 85); // slate-700
    doc.roundedRect(pageWidth - margin - textW, 12, textW, 8, 2, 2, 'F');
    doc.text(recordsText, pageWidth - margin - textW + 4, 17.5);

    let cursorY = 46;

    // Grand totals accumulators
    let grandTotalIn = 0;
    let grandTotalOut = 0;

    if (records.length === 0) {
      doc.setTextColor(...grayText);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('No records found for the selected date range.', pageWidth / 2, cursorY + 20, { align: 'center' });
    } else {
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const dateStr = format(record.date, 'dd MMM yyyy, EEEE');
        const entries = record.entries || [];
        const totalIn = record.totalIn || 0;
        const totalOut = record.totalOut || 0;
        const totalLeft = record.totalLeft || 0;

        grandTotalIn += totalIn;
        grandTotalOut += totalOut;

        // Check if we need a new page (at least 50mm needed for a day block)
        if (cursorY > pageHeight - 60) {
          doc.addPage();
          cursorY = 14;
        }

        // ─── Day header bar ───
        doc.setFillColor(...primaryDark);
        doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 9, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(dateStr, margin + 4, cursorY + 6.2);

        // Entry count badge
        const countText = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(countText, pageWidth - margin - 4, cursorY + 6.2, { align: 'right' });

        cursorY += 12;

        // ─── Entries table ───
        if (entries.length > 0) {
          const tableData = entries.map((entry: any, idx: number) => [
            (idx + 1).toString(),
            entry.description || '-',
            entry.type === 'in' ? formatCurrency(entry.amount) : '',
            entry.type === 'out' ? formatCurrency(entry.amount) : '',
          ]);

          autoTable(doc, {
            startY: cursorY,
            head: [['#', 'Description', 'Cash In', 'Cash Out']],
            body: tableData,
            margin: { left: margin, right: margin },
            styles: {
              fontSize: 8.5,
              cellPadding: 2.5,
              lineColor: borderColor,
              lineWidth: 0.1,
              textColor: [30, 41, 59] as [number, number, number], // slate-800
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
              1: { cellWidth: 'auto' },
              2: { cellWidth: 30, halign: 'right', textColor: greenDark, fontStyle: 'bold' },
              3: { cellWidth: 30, halign: 'right', textColor: redDark, fontStyle: 'bold' },
            },
            alternateRowStyles: {
              fillColor: [252, 252, 253] as [number, number, number],
            },
            didDrawPage: () => {
              // If table spans multiple pages, update cursorY
            },
          });

          cursorY = (doc as any).lastAutoTable.finalY + 1;
        }

        // ─── Day totals row ───
        if (cursorY > pageHeight - 30) {
          doc.addPage();
          cursorY = 14;
        }

        // Totals background
        doc.setFillColor(241, 245, 249); // slate-100
        doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 8, 1, 1, 'F');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');

        // In total
        doc.setTextColor(...greenDark);
        doc.text(`In: ${formatCurrency(totalIn)}`, margin + 4, cursorY + 5.5);

        // Out total
        doc.setTextColor(...redDark);
        doc.text(`Out: ${formatCurrency(totalOut)}`, margin + 60, cursorY + 5.5);

        // Balance
        const balColor = totalLeft >= 0 ? greenDark : redDark;
        doc.setTextColor(...balColor);
        doc.text(`Balance: ${formatCurrency(totalLeft)}`, pageWidth - margin - 4, cursorY + 5.5, { align: 'right' });

        cursorY += 14;
      }

      // ═══════════════════ GRAND TOTAL SECTION ═══════════════════
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 14;
      }

      const grandTotalLeft = grandTotalIn - grandTotalOut;

      // Separator line
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.5);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 4;

      // Grand total background
      doc.setFillColor(...primaryDark);
      doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 20, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('GRAND TOTAL', margin + 6, cursorY + 7);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      // Grand In
      doc.setTextColor(134, 239, 172); // green-300
      doc.text(`Total In:  ${formatCurrency(grandTotalIn)}`, margin + 6, cursorY + 14);

      // Grand Out
      doc.setTextColor(252, 165, 165); // red-300
      const outText = `Total Out:  ${formatCurrency(grandTotalOut)}`;
      doc.text(outText, pageWidth / 2 - 10, cursorY + 14);

      // Grand Balance
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(formatCurrency(grandTotalLeft), pageWidth - margin - 6, cursorY + 12, { align: 'right' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 210, 220);
      doc.text('Net Balance', pageWidth - margin - 6, cursorY + 17, { align: 'right' });
    }

    // ═══════════════════ FOOTER ON ALL PAGES ═══════════════════
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...grayText);
      doc.setFont('helvetica', 'normal');
      doc.text('EasyRakh  |  Daily Cash Record Report', margin, pageHeight - 6);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    // Output
    const pdfBuffer = doc.output('arraybuffer');

    const fileName = `Cash_Report_${format(fromDate, 'dd-MMM-yyyy')}_to_${format(toDate, 'dd-MMM-yyyy')}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF report' },
      { status: 500 }
    );
  }
}
