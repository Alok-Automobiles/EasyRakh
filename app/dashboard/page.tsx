import { headers } from 'next/headers';
import DashboardClient from './DashboardClient';

export const revalidate = 60;

async function fetchDashboardDataServer() {
  try {
    let cookieHeader = '';
    try {
      const hdrs = await headers();
      cookieHeader = hdrs.get('cookie') || '';
    } catch {
      return null;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const response = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as any;
  } catch (error) {
    console.warn('dashboard server prefetch failed', error);
    return null;
  }
}

export default async function DashboardPage() {
  const initialData = await fetchDashboardDataServer();
  return <DashboardClient initialData={initialData} />;
}
