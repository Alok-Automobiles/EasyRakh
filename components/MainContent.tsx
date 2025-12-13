'use client';

import { usePathname } from 'next/navigation';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Don't add sidebar margin on landing page, login, or register pages
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';
  
  return (
    <main className={`min-h-screen bg-gray-50 ${isAuthPage ? '' : 'lg:ml-64 pt-16 lg:pt-0'}`}>
      {children}
    </main>
  );
}

