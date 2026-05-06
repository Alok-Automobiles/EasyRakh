import DashboardClient from './DashboardClient';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return <DashboardClient />;
}
