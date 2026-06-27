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
  await expect(page.getByLabel(/password/i)).toBeVisible();

  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByText(/invalid email address/i)).toBeVisible();
  await expect(page.getByText(/password is required/i)).toBeVisible();
});
