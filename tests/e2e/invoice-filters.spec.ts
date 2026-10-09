import { expect, test } from '@playwright/test';

const invoiceId = '507f1f77bcf86cd799439015';
const customerId = '507f1f77bcf86cd799439012';
const invoice = {
  id: invoiceId,
  invoiceNumber: 'INV-2026-09-0001',
  invoiceDate: '2026-09-20T00:00:00.000Z',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  customerId,
  customerName: 'Raj Traders',
  customerPhone: '9999999999',
  items: [],
  totalAmount: 900,
  paidAmount: 0,
  payments: [],
  status: 'unpaid',
  addedToLedger: false,
};

test('invoice filters persist in the URL and survive detail navigation', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.context().addCookies([{ name: 'token', value: 'browser-test', domain: 'localhost', path: '/' }]);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname === '/api/invoices') {
      body = { invoices: [invoice], pagination: { total: 1, page: Number(url.searchParams.get('page') || 1), pageSize: 20, totalPages: 1 } };
    } else if (url.pathname === `/api/invoices/${invoiceId}`) {
      body = { invoice };
    } else if (url.pathname === '/api/customers') {
      body = { customers: [{ id: customerId, name: 'Raj Traders', phone: '9999999999' }], pagination: { page: 1, totalPages: 1 } };
    } else if (url.pathname === `/api/customers/${customerId}`) {
      body = { customer: { id: customerId, name: 'Raj Traders', phone: '9999999999' } };
    } else if (url.pathname === '/api/bootstrap') {
      body = { user: { name: 'Test User', email: 'test@example.com' }, collectionTypes: [] };
    } else if (url.pathname === '/api/auth/me') {
      body = { user: { name: 'Test User', email: 'test@example.com' } };
    } else if (url.pathname === '/api/collection-types') {
      body = { collectionTypes: [] };
    } else if (url.pathname === '/api/transactions') {
      body = { transactions: [] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open invoice ${invoice.invoiceNumber}` })).toBeVisible();
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Search invoices' }).fill('Raj');
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('Raj');
  await page.getByRole('combobox', { name: 'Payment status' }).click();
  await page.getByRole('option', { name: 'Unpaid' }).click();
  await page.getByRole('combobox', { name: 'Sort invoices' }).click();
  await page.getByRole('option', { name: 'Amount: highest' }).click();
  await page.getByRole('combobox', { name: 'Invoice date' }).click();
  await page.getByRole('option', { name: 'Custom range' }).click();
  await page.getByLabel('From invoice date').fill('2026-07-20');
  await page.getByLabel('To invoice date').fill('2026-07-01');
  await expect(page.getByText('From date must be on or before To date.')).toBeVisible();
  expect(new URL(page.url()).searchParams.has('endDate')).toBe(false);
  await page.getByLabel('To invoice date').fill('2026-07-31');
  await expect.poll(() => new URL(page.url()).searchParams.get('endDate')).toBe('2026-07-31');
  await page.getByRole('button', { name: 'More filters' }).click();
  await page.getByRole('button', { name: 'Customer: All customers' }).click();
  await expect(page.getByRole('dialog', { name: 'Filter by customer' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Search customers by name or phone' }).fill('Raj');
  await page.getByRole('option', { name: /Raj Traders/ }).click();
  await page.getByLabel('Minimum total (₹)').fill('100');
  await page.getByLabel('Maximum total (₹)').fill('1000');
  await expect.poll(() => new URL(page.url()).searchParams.get('maxAmount')).toBe('1000');
  await page.getByRole('combobox', { name: 'Ledger status' }).click();
  await page.getByRole('option', { name: 'Not in ledger' }).click();

  const filteredUrl = page.url();
  const filteredParams = new URL(filteredUrl).searchParams;
  expect(filteredParams.get('customerId')).toBe(customerId);
  expect(filteredParams.get('status')).toBe('unpaid');
  expect(filteredParams.get('sort')).toBe('amount-desc');
  expect(filteredParams.get('startDate')).toBe('2026-07-20');
  expect(filteredParams.get('endDate')).toBe('2026-07-31');
  expect(filteredParams.get('addedToLedger')).toBe('false');
  await page.screenshot({ path: testInfo.outputPath('invoice-filters.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search invoices' })).toHaveValue('Raj');
  await expect(page.getByRole('button', { name: `Open invoice ${invoice.invoiceNumber}` })).toBeVisible();
  await page.getByRole('button', { name: `Open invoice ${invoice.invoiceNumber}` }).click();
  await expect(page.getByRole('link', { name: 'Back to Invoices' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.getByRole('textbox', { name: 'Search invoices' })).toHaveValue('Raj');
  await expect(page.getByRole('button', { name: `Open invoice ${invoice.invoiceNumber}` })).toBeVisible();

  await page.getByRole('button', { name: `Open invoice ${invoice.invoiceNumber}` }).click();
  await expect(page.getByRole('link', { name: 'Back to Invoices' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Invoices' }).click();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.getByRole('textbox', { name: 'Search invoices' })).toHaveValue('Raj');
  expect(pageErrors).toEqual([]);
});
