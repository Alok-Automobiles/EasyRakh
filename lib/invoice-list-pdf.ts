import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInvoiceListDate } from './invoice-list-state';
import { roundMoney } from './invoice-calculations';

export type InvoiceReportRow = {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  invoiceDate?: Date | string;
  createdAt: Date | string;
  totalAmount: number;
  paidAmount: number;
  status: string;
};

export function buildInvoiceListPdfBuffer(
  invoices: InvoiceReportRow[],
  filters: { status: string; startDate?: string; endDate?: string },
) {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const money = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const labels: Record<string, string> = { all: 'All statuses', paid: 'Paid', unpaid: 'Unpaid', partial: 'Partially paid', outstanding: 'Unpaid + partially paid' };
  const totals = invoices.reduce((sum, invoice) => ({
    total: roundMoney(sum.total + invoice.totalAmount),
    paid: roundMoney(sum.paid + invoice.paidAmount),
    balance: roundMoney(sum.balance + Math.max(0, roundMoney(invoice.totalAmount - invoice.paidAmount))),
  }), { total: 0, paid: 0, balance: 0 });
  doc.setFontSize(20);
  doc.text('Invoice list', 14, 19);
  doc.setFontSize(9);
  doc.text(`${labels[filters.status] || filters.status} | Invoice dates: ${filters.startDate || 'Any'} to ${filters.endDate || 'Any'}`, 14, 27);
  doc.text(`Generated: ${formatInvoiceListDate(new Date())} | ${invoices.length} invoices | All amounts in INR`, 14, 33);
  doc.text(`Total: ${money(totals.total)}    Paid: ${money(totals.paid)}    Outstanding: ${money(totals.balance)}`, 14, 40);
  autoTable(doc, {
    startY: 46, margin: { top: 16, bottom: 16, left: 14, right: 14 },
    head: [['Invoice number', 'Invoice date', 'Customer', 'Phone', 'Status', 'Total (INR)', 'Paid (INR)', 'Balance (INR)']],
    body: invoices.map((invoice) => [
      invoice.invoiceNumber, formatInvoiceListDate(invoice.invoiceDate || invoice.createdAt),
      invoice.customerName, invoice.customerPhone || '-', labels[invoice.status] || invoice.status,
      money(invoice.totalAmount), money(invoice.paidAmount), money(Math.max(0, roundMoney(invoice.totalAmount - invoice.paidAmount))),
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 27 }, 2: { cellWidth: 48 }, 3: { cellWidth: 29 }, 4: { cellWidth: 29 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    rowPageBreak: 'avoid',
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Page ${page} of ${pages}`, 283, 202, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}
