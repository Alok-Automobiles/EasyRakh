import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Mock only data services. This profiles the real production client bundle,
// with a mobile viewport and 4x CPU slowdown, without touching account data.
test('profiles dashboard, directories, inventory, and invoice typing', async ({ page, context }) => {
  await context.addCookies([{ name: 'token', value: 'performance-fixture', domain: 'localhost', path: '/' }]);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let bootstrapRequests = 0;
  const customerId = '507f1f77bcf86cd799439012';
  const customers = Array.from({ length: 20 }, (_, i) => ({
    id: i === 0 ? customerId : i.toString(16).padStart(24, '0'), name: `Customer ${i}`,
    openingBalance: 0, balanceType: 'debit', totalBalance: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (pathname === '/api/bootstrap') {
      bootstrapRequests++;
      body = { user: { id: '507f1f77bcf86cd799439011', name: 'Fixture', email: 'fixture@example.test', firmTitle: 'Fixture', firmAddress: 'Fixture', firmPhone: '1234567890' }, collectionTypes: [] };
    } else if (pathname === '/api/dashboard/stats') {
      body = { stats: { totalCredit: 0, totalDebit: 0, netBalance: 0, totalCustomers: 2000, totalSuppliers: 0, totalTransactions: 5000, inventory: { totalItems: 0, totalQuantity: 0, totalValue: 0, outOfStockItems: 0, inactiveItems: 0, restockItems: 0, lowStockThreshold: 5 }, todayCash: { totalIn: 0, totalOut: 0, totalLeft: 0 }, monthlyTotals: { totalIn: 0, totalOut: 0, totalLeft: 0 }, monthlySeries: [] }, activities: [], dashboardNotes: [], topCustomers: [], topSuppliers: [] };
    } else if (pathname === '/api/customers') {
      body = { customers, pagination: { total: 2000, page: 1, totalPages: 100, pageSize: 20 }, summary: { total: 2000, receivable: 200000, payable: 0 } };
    } else if (pathname === '/api/suppliers') {
      body = { suppliers: [], pagination: { total: 0, page: 1, totalPages: 1 }, summary: { total: 0, receivable: 0, payable: 0 } };
    } else if (pathname === '/api/inventory') {
      body = { items: [], stats: { totalItems: 0, totalQuantity: 0, totalValue: 0, outOfStockItems: 0, restockItems: 0, inactiveItems: 0, lowStockThreshold: 5, locations: [], brands: [], suppliers: [] }, lowStockItems: [], restockItems: [], outOfStockItems: [], inactiveItems: [], pagination: { total: 0, page: 1, totalPages: 1 } };
    } else if (pathname === '/api/search') body = { results: [] };
    else if (pathname === '/api/invoices/next-number') body = { invoiceNumber: 'INV-00001' };
    else if (pathname === '/api/business-cash') body = { enabled: false };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const metrics = { longTasks: [] as number[], interactions: [] as number[] };
    Object.assign(window, { __performanceFixture: metrics });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if ('interactionId' in entry && entry.interactionId) metrics.interactions.push(entry.duration);
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  });
  const results: unknown[] = [];
  for (const scenario of [
    { path: '/dashboard', placeholder: 'Search inventory, customers, suppliers, invoices...' },
    { path: '/customers', placeholder: 'Search customers by name, phone, email or address' },
    { path: '/inventory-items', placeholder: 'Search name, brand, code, location, supplier...' },
    { path: '/invoices/new', placeholder: 'Search or enter customer name...' },
  ]) {
    for (const visit of ['cold', 'warm']) {
      const start = Date.now();
      await page.goto(scenario.path);
      const input = page.getByPlaceholder(scenario.placeholder);
      await expect(input).toBeVisible();
      const readyMs = Date.now() - start;
      await input.fill('');
      await input.pressSequentially('sample customer', { delay: 40 });
      await expect(input).toHaveValue('sample customer');
      // Let the debounced request and pending paints complete.
      await page.waitForTimeout(400);
      const metrics = await page.evaluate(() => {
        const state = (window as unknown as { __performanceFixture: { longTasks: number[]; interactions: number[] } }).__performanceFixture;
        const interactions = [...state.interactions].sort((a, b) => a - b);
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return { longTaskCount: state.longTasks.length,
          maxLongTaskMs: Math.max(0, ...state.longTasks),
          interactionP75Ms: interactions[Math.floor((interactions.length - 1) * 0.75)] ?? 0,
          maxInteractionMs: Math.max(0, ...interactions),
          ttfbMs: navigation.responseStart - navigation.requestStart };
      });
      results.push({ path: scenario.path, visit, readyMs, ...metrics });
    }
  }
  // Navigation within the app retains the account's shared bootstrap query.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requestsBeforeNavigation = bootstrapRequests;
  await page.locator('a[href="/customers"]:visible').first().click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByPlaceholder('Search customers by name, phone, email or address')).toBeVisible();
  expect(bootstrapRequests).toBe(requestsBeforeNavigation);
  expect(errors).toEqual([]);
  mkdirSync('test-results/performance', { recursive: true });
  writeFileSync('test-results/performance/browser.json', JSON.stringify({
    environment: 'local production build; mocked APIs; Pixel 5 viewport; CPU 4x',
    note: 'Event Timing samples are diagnostic, not field INP or a real device percentile.', results,
  }, null, 2));
});
