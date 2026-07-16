'use client';

import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

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
    return <div className="marketing-ui min-h-screen bg-background text-foreground">{children}</div>;
  }

  if (isAuthPage) {
    return (
      <div className="app-ui min-h-screen bg-background text-foreground">
        <div className="fixed right-4 top-4 z-50">
          <ThemeToggle />
        </div>
        <MainContent sidebarCollapsed={false}>{children}</MainContent>
      </div>
    );
  }

  return (
    <div
      className="app-ui min-h-screen bg-background text-foreground"
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
