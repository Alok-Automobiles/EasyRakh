import type { InvoiceItem } from '@/lib/types';

export interface InvoiceItemDisplayRow {
  serialNumber: string;
  itemNumber: string;
  itemName: string;
  quantity: string;
  amount: number;
}

export function formatInvoiceQuantity(quantity: number): string {
  if (!Number.isFinite(quantity)) return '0';
  return Number.isInteger(quantity) ? quantity.toString() : quantity.toString();
}

export function getInvoiceItemDisplayRows(items: InvoiceItem[]): InvoiceItemDisplayRow[] {
  return items.map((item, index) => ({
    serialNumber: (index + 1).toString(),
    itemNumber: item.itemNumber?.trim() || '-',
    itemName: item.itemName,
    quantity: formatInvoiceQuantity(item.quantity),
    amount: item.amount,
  }));
}

export function getInvoicePdfTableRows(items: InvoiceItem[]): string[][] {
  return getInvoiceItemDisplayRows(items).map((item) => [
    item.serialNumber,
    item.itemNumber,
    item.itemName,
    item.quantity,
    `Rs ${item.amount.toLocaleString('en-IN')}`,
  ]);
}
