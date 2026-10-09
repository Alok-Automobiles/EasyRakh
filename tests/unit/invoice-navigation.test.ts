import { describe, expect, it } from 'vitest';
import { invoiceDetailUrl, invoiceListReturnUrl } from '@/lib/invoice-navigation';

describe('invoiceListReturnUrl', () => {
  it.each([
    '/invoices',
    '/invoices?',
    '/invoices?search=Ravi&status=unpaid&page=3',
    '/invoices?startDate=2026-09-01&endDate=2026-09-30&sort=amount_desc',
    '/invoices?search=A%26B%20%23one',
  ])('preserves a local invoice list URL: %s', (url) => {
    expect(invoiceListReturnUrl(url)).toBe(url);
  });

  it.each([
    undefined,
    null,
    '',
    'https://example.com/invoices',
    '//example.com/invoices',
    'javascript:alert(1)',
    'invoices?status=paid',
    '/invoices/new',
    '/invoices/123',
    '/invoices/',
    '/invoices-extra',
    '/invoices/../settings',
    '/invoices%3Fstatus=paid',
    '/invoices#section',
    '/invoices?status=paid#section',
    '/invoices?search=hello\\world',
    '/invoices?status=paid\n',
    '/invoices?search=\u0000test',
    '/invoices?search=\u007ftest',
    ' /invoices',
  ])('rejects unsupported or unsafe return targets: %s', (url) => {
    expect(invoiceListReturnUrl(url)).toBe('/invoices');
  });
});

describe('invoiceDetailUrl', () => {
  it('keeps unfiltered invoice links unchanged', () => {
    expect(invoiceDetailUrl('invoice-1', '/invoices')).toBe('/invoices/invoice-1');
  });

  it.each(['share', 'download'] as const)('preserves the existing %s action', (action) => {
    expect(invoiceDetailUrl('invoice-1', '/invoices', action)).toBe(`/invoices/invoice-1?${action}=true`);
  });

  it.each([undefined, 'share', 'download'] as const)('encodes filters as one return parameter for %s', (action) => {
    const returnTo = '/invoices?search=A%26B&status=unpaid&customerId=abc&page=3';
    const url = new URL(invoiceDetailUrl('invoice-1', returnTo, action), 'https://example.com');

    expect(url.pathname).toBe('/invoices/invoice-1');
    expect(url.searchParams.get('returnTo')).toBe(returnTo);
    expect([...url.searchParams.keys()]).toEqual(action ? ['returnTo', action] : ['returnTo']);
    if (action) expect(url.searchParams.get(action)).toBe('true');
  });

  it('discards unsafe return targets before constructing a link', () => {
    expect(invoiceDetailUrl('invoice-1', '//example.com', 'share')).toBe('/invoices/invoice-1?share=true');
  });

  it('encodes the invoice ID as a single path segment', () => {
    expect(invoiceDetailUrl('some/id?download=true#part', '/invoices'))
      .toBe('/invoices/some%2Fid%3Fdownload%3Dtrue%23part');
  });
});
