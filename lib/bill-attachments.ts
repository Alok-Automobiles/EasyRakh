// Only app-owned invoice URLs may bypass the Cloudinary bill proxy.
export function isInvoiceDownloadUrl(url?: string): url is string {
  return /^\/api\/invoices\/[a-f0-9]{24}\/download\?filename=invoice\.pdf$/i.test(url || '');
}

export type BillAttachment = {
  id: string;
  billUrl?: string;
  billPublicId?: string;
};

export function isPdfBillAttachment(
  attachment: Pick<BillAttachment, 'billUrl' | 'billPublicId'>
) {
  return [attachment.billUrl, attachment.billPublicId].some((value) =>
    /\.pdf(?:$|[?#])/i.test(value || '')
  );
}

export function getDailyCashBillViewUrl(recordId: string, attachment: BillAttachment) {
  if (!attachment.billUrl) return '';
  if (isInvoiceDownloadUrl(attachment.billUrl)) return attachment.billUrl;
  if (!isPdfBillAttachment(attachment)) return attachment.billUrl;

  return [
    '/api/daily-cash-records',
    encodeURIComponent(recordId),
    'entries',
    encodeURIComponent(attachment.id),
    'bill',
  ].join('/');
}

export function getTransactionBillViewUrl(
  transactionId: string,
  attachment: Pick<BillAttachment, 'billUrl' | 'billPublicId'>
) {
  if (!attachment.billUrl) return '';
  if (isInvoiceDownloadUrl(attachment.billUrl)) return attachment.billUrl;
  if (!isPdfBillAttachment(attachment)) return attachment.billUrl;

  return `/api/transactions/${encodeURIComponent(transactionId)}/bill`;
}
