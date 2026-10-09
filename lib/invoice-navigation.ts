/** Keep invoice return links on the list page while preserving its filters. */
export function invoiceListReturnUrl(value: string | null | undefined): string {
  if (
    !value ||
    /[\u0000-\u001f\u007f#\\]/.test(value) ||
    (value !== '/invoices' && !value.startsWith('/invoices?'))
  ) {
    return '/invoices';
  }

  return value;
}

export function invoiceDetailUrl(
  id: string,
  returnTo: string,
  action?: 'share' | 'download',
): string {
  const searchParams = new URLSearchParams();
  const safeReturnTo = invoiceListReturnUrl(returnTo);

  if (safeReturnTo !== '/invoices') searchParams.set('returnTo', safeReturnTo);
  if (action) searchParams.set(action, 'true');

  const query = searchParams.toString();
  return `/invoices/${encodeURIComponent(id)}${query ? `?${query}` : ''}`;
}
