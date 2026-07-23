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
  if (!isPdfBillAttachment(attachment)) return attachment.billUrl;

  return [
    '/api/daily-cash-records',
    encodeURIComponent(recordId),
    'entries',
    encodeURIComponent(attachment.id),
    'bill',
  ].join('/');
}
