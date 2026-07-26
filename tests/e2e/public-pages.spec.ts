import { expect, test } from '@playwright/test';

test('marketing home page exposes the primary product story', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/EasyRakh/);
  await expect(
    page.getByRole('heading', {
      name: /see your entire business at a glance with easyrakh/i,
    })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Get Started', exact: true })
  ).toHaveAttribute('href', '/register');
  await expect(page.getByText(/ledger maintenance/i)).toBeVisible();
  await expect(page.getByText(/inventory & stock tracking/i)).toBeVisible();
});

test('login form renders accessible fields and client-side validation', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByText('Sign in to your account')).toBeVisible();
  await expect(page.getByLabel(/email address/i)).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByText(/invalid email address/i)).toBeVisible();
  await expect(page.getByText(/password is required/i)).toBeVisible();
});

test('authentication pages switch between dark and light themes', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('easyrakh-theme', 'dark');
  });
  await page.goto('/login');

  const themeToggle = page.getByRole('button', { name: /switch to light mode/i });
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.auth-kinetic-page')).toHaveCSS(
    'background-color',
    'rgb(233, 241, 235)',
  );
  await expect(page.getByLabel(/email address/i)).toHaveCSS('color-scheme', 'light');
  await expect(
    page.getByRole('button', { name: /switch to dark mode/i }),
  ).toBeVisible();
});

test('authentication particle scene starts with equal in-bounds targets', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByAltText('EasyRakh logo')).toHaveAttribute(
    'src',
    /logo\.png/,
  );

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-particle-shape', 'rupee');
  await expect(canvas).toHaveAttribute('data-targets-in-bounds', 'true');

  const targetCounts = await canvas.evaluate((element) => ({
    canvasHeight: element.clientHeight,
    particles: Number(element.dataset.particleCount),
    rupee: Number(element.dataset.rupeeTargetCount),
    rupeeBottom: Number(element.dataset.rupeeTargetBottom),
    rupeeHeight: Number(element.dataset.rupeeTargetHeight),
    rupeeWidth: Number(element.dataset.rupeeTargetWidth),
    usableWidth: Number(element.dataset.particleUsableWidth),
    word: Number(element.dataset.wordTargetCount),
  }));

  expect(targetCounts.rupee).toBe(targetCounts.particles);
  expect(targetCounts.word).toBe(targetCounts.particles);
  expect(targetCounts.rupeeWidth).toBeGreaterThan(
    targetCounts.usableWidth * 0.6,
  );
  expect(targetCounts.rupeeHeight).toBeGreaterThan(
    targetCounts.canvasHeight * 0.7,
  );
  expect(targetCounts.rupeeBottom).toBeGreaterThan(
    targetCounts.canvasHeight * 0.94,
  );

  await canvas.click();
  await expect(canvas).toHaveAttribute('data-pointer-active', 'true');
});
