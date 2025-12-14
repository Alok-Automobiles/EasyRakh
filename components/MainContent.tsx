'use client';

import { usePathname } from 'next/navigation';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Don't add sidebar margin on landing page, login, or register pages
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';
  
  return (
    <main className={`min-h-screen bg-gray-50 overflow-x-hidden w-full ${isAuthPage ? '' : 'lg:ml-64 pt-16 lg:pt-0'}`}>
      <div className="w-full max-w-full overflow-x-hidden lg:pl-0">
        {children}
      </div>
    </main>
  );
}

