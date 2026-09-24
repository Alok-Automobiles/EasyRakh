import { z } from 'zod';

const draftSchema = z.object({
  invoiceDate: z.string(),
  customerSearch: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerAddress: z.string(),
  selectedCustomer: z.object({ id: z.string(), name: z.string(), phone: z.string().optional(), address: z.string().optional() }).nullable(),
  createNewCustomer: z.boolean(),
  items: z.array(z.object({
    id: z.string(), inventoryItemId: z.string().optional(),
    itemNumber: z.string(), itemName: z.string(),
    quantity: z.number(), quantityInput: z.string().optional(),
    amount: z.number(), amountInput: z.string().optional(),
    unitCost: z.number().optional(), unitCostInput: z.string().optional(),
  })).min(1),
  paidAmount: z.number(),
  notes: z.string(),
  addToLedger: z.boolean(),
  clientRequestId: z.string().nullable(),
});

export type InvoiceDraft = z.infer<typeof draftSchema>;
export const invoiceDraftKey = (userId: string) => `invoice-draft:v1:${userId}`;

export function readInvoiceDraft(key: string): InvoiceDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeInvoiceDraft(key: string, draft: InvoiceDraft): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearInvoiceDraft(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Storage can be unavailable. */ }
}
