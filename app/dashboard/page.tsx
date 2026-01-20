import { cookies } from 'next/headers';
import DashboardClient from './DashboardClient';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

async function fetchDashboardDataServer() {
  try {
    // In Turbopack/dev, cookie handling can break source maps; skip server prefetch there.
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }

    let cookieHeader = '';
    try {
      const cookieStore = cookies();
      cookieHeader = cookieStore
        .getAll()
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ');
    } catch {
      // If cookies() fails (e.g., Turbopack dev), skip server prefetch to avoid errors
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
