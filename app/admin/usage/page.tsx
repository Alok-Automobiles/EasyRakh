import AdminUsageClient from './AdminUsageClient';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default function AdminUsagePage() {
  return <AdminUsageClient />;
}
