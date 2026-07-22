import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { randomUUID } from 'node:crypto';
import type { InvoiceItem, InvoiceSellerSnapshot } from './types';
import { invoiceLineTotal, legacyUnitPrice } from './invoice-calculations';

export type InvoicePdfInput = {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'unpaid' | 'partial';
  notes?: string;
  createdAt: Date | string;
  sellerSnapshot: InvoiceSellerSnapshot;
};

export function isSellerSnapshotComplete(snapshot?: Partial<InvoiceSellerSnapshot> | null) {
  return Boolean(
    snapshot?.firmTitle?.trim() &&
    snapshot?.gstNumber?.trim() &&
    snapshot?.firmPhone?.trim() &&
    snapshot?.firmEmail?.trim() &&
    snapshot?.firmAddress?.trim()
  );
}

export function sellerSnapshotFromUser(user: Record<string, unknown>): InvoiceSellerSnapshot {
  return {
    firmTitle: String(user.firmTitle || '').trim(),
    gstNumber: String(user.gstNumber || '').trim(),
    firmPhone: String(user.firmPhone || '').trim(),
    firmEmail: String(user.firmEmail || '').trim(),
    firmAddress: String(user.firmAddress || '').trim(),
  };
}

export function buildInvoicePdfBuffer(invoice: InvoicePdfInput): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const margin = 16;
  const seller = invoice.sellerSnapshot;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, width, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.text('INVOICE', margin, 23);
  doc.setFontSize(15);
  doc.text(seller.firmTitle, width - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`GST: ${seller.gstNumber}`, width - margin, 21, { align: 'right' });
  doc.text(`${seller.firmPhone} | ${seller.firmEmail}`, width - margin, 26, { align: 'right' });
  doc.text(seller.firmAddress, width - margin, 31, { align: 'right', maxWidth: 95 });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BILL TO', margin, 52);
  doc.setFontSize(12);
  doc.text(invoice.customerName, margin, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let customerY = 64;
  if (invoice.customerPhone) {
    doc.text(invoice.customerPhone, margin, customerY);
    customerY += 5;
  }
  if (invoice.customerAddress) {
    const addressLines = doc.splitTextToSize(invoice.customerAddress, 90);
    doc.text(addressLines, margin, customerY);
    customerY += addressLines.length * 4;
  }

  const createdAt = new Date(invoice.createdAt);
  const dateLabel = Number.isFinite(createdAt.getTime())
    ? createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '';
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice No.', width - 68, 52);
  doc.text('Date', width - 68, 59);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoiceNumber, width - margin, 52, { align: 'right' });
  doc.text(dateLabel, width - margin, 59, { align: 'right' });

  autoTable(doc, {
    startY: Math.max(77, customerY + 5),
    margin: { left: margin, right: margin },
    head: [['#', 'Part No.', 'Item', 'Qty', 'Unit Price', 'Amount']],
    body: invoice.items.map((item, index) => [
      String(index + 1),
      item.itemNumber || '-',
      item.itemName,
      String(item.quantity),
      `Rs ${legacyUnitPrice(item).toLocaleString('en-IN')}`,
      `Rs ${invoiceLineTotal(item).toLocaleString('en-IN')}`,
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: [31, 41, 55] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 28 },
      3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 29, halign: 'right' },
      5: { cellWidth: 29, halign: 'right' },
    },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 90;
  const totalsX = width - margin;
  let totalsY = finalY + 10;
  if (totalsY > pageHeight - 42) {
    doc.addPage();
    totalsY = 20;
  }
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Invoice Total', totalsX - 55, totalsY);
  doc.text(`Rs ${invoice.totalAmount.toLocaleString('en-IN')}`, totalsX, totalsY, { align: 'right' });
  totalsY += 6;
  doc.text('Paid', totalsX - 55, totalsY);
  doc.text(`Rs ${invoice.paidAmount.toLocaleString('en-IN')}`, totalsX, totalsY, { align: 'right' });
  totalsY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Balance Due', totalsX - 55, totalsY);
  doc.text(`Rs ${Math.max(0, invoice.totalAmount - invoice.paidAmount).toLocaleString('en-IN')}`, totalsX, totalsY, { align: 'right' });

  if (invoice.notes) {
    const noteLines = doc.splitTextToSize(invoice.notes, width - margin * 2);
    if (totalsY + 13 + noteLines.length * 4 > pageHeight - 18) {
      doc.addPage();
      totalsY = 20;
    } else {
      totalsY += 13;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', margin, totalsY);
    doc.setFont('helvetica', 'normal');
    let lineY = totalsY + 5;
    for (const line of noteLines) {
      if (lineY > pageHeight - 18) {
        doc.addPage();
        lineY = 20;
      }
      doc.text(line, margin, lineY);
      lineY += 4;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    doc.text(`Payment status: ${invoice.status.toUpperCase()}`, margin, pageHeight - 8);
    doc.text(`Page ${pageNumber} of ${pageCount}`, width / 2, pageHeight - 8, { align: 'center' });
    doc.text('Thank you for your business.', width - margin, pageHeight - 8, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

export async function uploadInvoicePdf(userId: string, invoice: InvoicePdfInput) {
  const { uploadBuffer } = await import('./cloudinary');
  const buffer = buildInvoicePdfBuffer(invoice);
  const safeInvoiceNumber = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '-');
  const result = await uploadBuffer(buffer, {
    folder: `ledger-bills/${userId}/invoices`,
    resource_type: 'raw',
    public_id: `${safeInvoiceNumber}-${Date.now()}-${randomUUID()}.pdf`,
    overwrite: false,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}
