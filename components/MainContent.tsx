'use client';

import { usePathname } from 'next/navigation';

type MainContentProps = {
  children: React.ReactNode;
  sidebarCollapsed?: boolean;
};

export default function MainContent({ children, sidebarCollapsed = false }: MainContentProps) {
  const pathname = usePathname();
  
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';
  
  if (isAuthPage) {
    return (
      <main className="min-h-screen bg-background text-foreground overflow-x-hidden w-full">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0 bg-background text-foreground overflow-x-hidden">
      <div className={`mx-auto w-full max-w-[1600px] px-4 pb-8 pt-16 sm:px-6 lg:px-8 lg:py-8 transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-6' : 'lg:pl-8'}`}>
        {children}
      </div>
    </main>
  );
}
