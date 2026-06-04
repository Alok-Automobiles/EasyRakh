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
      <main className="min-h-screen bg-gray-50 overflow-x-hidden w-full">
        <div className="w-full max-w-full px-4 py-6 lg:px-8">
          {children}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-w-0 bg-gray-50 overflow-x-hidden">
      <div className={`w-full max-w-full px-4 pb-6 pt-16 lg:px-8 lg:py-6 transition-[padding] duration-200 ${sidebarCollapsed ? 'lg:pl-6' : 'lg:pl-8'}`}>
        {children}
      </div>
    </main>
  );
}

