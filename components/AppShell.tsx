'use client';

import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import { usePathname } from 'next/navigation';

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isMarketingPage =
    pathname === '/' || pathname === '/about' || pathname === '/privacy' || pathname === '/terms';
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/forgot-password');
  const sidebarWidth = '16rem';

  if (isMarketingPage) {
    return <>{children}</>;
  }

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <MainContent sidebarCollapsed={false}>{children}</MainContent>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ ['--sidebar-width' as string]: sidebarWidth }}
    >
      <Sidebar />
      <div className="lg:pl-[var(--sidebar-width)]">
        <MainContent sidebarCollapsed={false}>
          {children}
        </MainContent>
      </div>
    </div>
  );
}

