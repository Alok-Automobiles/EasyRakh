'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const lastPathnameRef = useRef<string>('');

  // Don't show header on login/register pages or landing page
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';

  useEffect(() => {
    if (isAuthPage) {
      setLoading(false);
      return;
    }

    // Prevent duplicate calls for the same pathname
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;

    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        return null;
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pathname, router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  if (isAuthPage) {
    return null;
  }

  const headerClasses =
    'sticky top-0 z-50 w-full border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] supports-[backdrop-filter]:bg-white/60';

  if (loading) {
    return (
      <header className={headerClasses}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="text-xl font-bold text-gray-900">
              Easy<span className="text-blue-600">Rakh</span>
            </div>
          </div>
        </div>
      </header>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <header className={headerClasses}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900">
              Easy<span className="text-blue-600">Rakh</span>
            </Link>
            <nav className="hidden md:flex space-x-4">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/customers"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Manage Customers
              </Link>
              <Link
                href="/suppliers"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Manage Suppliers
              </Link>
              <Link
                href="/transactions/new"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                New Transaction
              </Link>
              <Link
                href="/daily-cash-record"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Daily Cash Record
              </Link>
              <Link
                href="/notes"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Notes
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user.name}</span>
            <Button
              onClick={handleLogout}
              variant="destructive"
              size="sm"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
