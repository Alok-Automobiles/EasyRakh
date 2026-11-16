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


test('invoice report dialog fits in light mode', async ({ page }, testInfo) => {
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

  await page.addInitScript(() => localStorage.setItem('easyrakh-theme', 'light'));
  await page.goto('/invoices');
  await page.getByRole('button', { name: 'Download list PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Download invoice list' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Invoice month', { exact: true }).fill('2026-10');
  await expect(dialog.getByLabel('From invoice date')).toHaveValue('2026-10-01');
  await expect(dialog.getByLabel('To invoice date')).toHaveValue('2026-10-31');
  await dialog.getByLabel('Payment status').selectOption('outstanding');
  await dialog.getByLabel('Ledger status').selectOption('true');
  await expect(dialog.getByRole('button', { name: 'Customer: All customers' })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('report-light.png') });
  expect(pageErrors).toEqual([]);
});
test('invoice report dialog fits in dark mode', async ({ page }, testInfo) => {
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

  await page.addInitScript(() => localStorage.setItem('easyrakh-theme', 'dark'));
  await page.goto('/invoices');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Download list PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Download invoice list' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Invoice month', { exact: true }).fill('2026-10');
  await expect(dialog.getByLabel('From invoice date')).toHaveValue('2026-10-01');
  await expect(dialog.getByLabel('To invoice date')).toHaveValue('2026-10-31');
  await dialog.getByLabel('Payment status').selectOption('outstanding');
  await dialog.getByLabel('Ledger status').selectOption('true');
  await expect(dialog.getByRole('button', { name: 'Customer: All customers' })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('report-dark.png') });
  expect(pageErrors).toEqual([]);
});
