'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getNavigationShortcutByHref } from '@/lib/keyboard-shortcuts';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const lastPathnameRef = useRef<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [customCollectionTypes, setCustomCollectionTypes] = useState<Array<{ id: string; name: string; slug: string; lastTransactionDate?: Date }>>([]);

  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';

  useEffect(() => {
    if (isAuthPage) {
      setLoading(false);
      return;
    }

    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;

    Promise.all([
      fetch('/api/auth/me').then((res) => {
        if (res.ok) {
          return res.json();
        }
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        return null;
      }),
      fetch('/api/collection-types').then((res) => {
        if (res.ok) {
          return res.json();
        }
        return { collectionTypes: [] };
      }).catch(() => ({ collectionTypes: [] })),
      fetch('/api/transactions?limit=100').then((res) => {
        if (res.ok) {
          return res.json();
        }
        return { transactions: [] };
      }).catch(() => ({ transactions: [] })),
    ])
      .then(([userData, collectionTypesData, transactionsData]) => {
        if (userData?.user) {
          setUser(userData.user);
        }
        if (collectionTypesData?.collectionTypes) {
          const collections = collectionTypesData.collectionTypes;
          const transactions = transactionsData?.transactions || [];
          
          const collectionLastTransactionMap = new Map<string, Date>();
          
          transactions.forEach((tx: { entityType: string; date: string | Date; createdAt: string | Date }) => {
            if (tx.entityType && tx.entityType !== 'customer' && tx.entityType !== 'supplier') {
              const txDate = new Date(tx.date || tx.createdAt);
              const existing = collectionLastTransactionMap.get(tx.entityType);
              if (!existing || txDate > existing) {
                collectionLastTransactionMap.set(tx.entityType, txDate);
              }
            }
          });
          
          const collectionsWithDates = collections.map((ct: { id: string; name: string; slug: string }) => ({
            ...ct,
            lastTransactionDate: collectionLastTransactionMap.get(ct.slug),
          }));
          

          collectionsWithDates.sort((a: { id: string; name: string; slug: string; lastTransactionDate?: Date }, b: { id: string; name: string; slug: string; lastTransactionDate?: Date }) => {
            if (a.lastTransactionDate && b.lastTransactionDate) {
              return b.lastTransactionDate.getTime() - a.lastTransactionDate.getTime();
            }
            if (a.lastTransactionDate) return -1;
            if (b.lastTransactionDate) return 1;
            return 0;
          });
          
          setCustomCollectionTypes(collectionsWithDates);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pathname, router]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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

  const topCollections = customCollectionTypes.slice(0, 2);
  const hasMoreCollections = customCollectionTypes.length > 2;

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/customers', label: 'Customers' },
    { href: '/suppliers', label: 'Suppliers' },
    { href: '/transactions/new', label: 'Transaction' },
    { href: '/daily-cash-record', label: 'Cash Record' },
    { href: '/notes', label: 'Notes' },
  ];

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
            <Link href="/" className="flex items-center">
              <Image
                src="/logo.png"
                alt="EasyRakh logo"
                width={40}
                height={40}
                className="rounded-full bg-white p-1 shadow-sm"
              />
            </Link>
            <nav className="hidden md:flex items-center space-x-4">
              {navLinks.map((link) => {
                const shortcut = getNavigationShortcutByHref(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-app-shortcut={shortcut?.display}
                    aria-keyshortcuts={shortcut?.aria}
                    className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap"
                  >
                    {link.label}
                  </Link>
                );
              })}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap flex items-center gap-1">
                    Collections
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {topCollections.length > 0 ? (
                    <>
                      {topCollections.map((ct) => (
                        <DropdownMenuItem key={ct.id} asChild>
                          <Link href={`/custom-entities/${ct.slug}`} className="cursor-pointer">
                            {ct.name}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      {hasMoreCollections && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href="/collection-types" className="cursor-pointer">
                              View All Collections
                            </Link>
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link href="/collection-types" className="cursor-pointer">
                        View All Collections
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user.name}</span>
            <div className="hidden md:block">
              <Button
                onClick={handleLogout}
                variant="destructive"
                size="sm"
                className="bg-red-700 hover:bg-red-800 focus-visible:ring-red-500/30"
              >
                Logout
              </Button>
            </div>
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <div
          className={`md:hidden transition-all duration-200 ease-in-out ${
            isMobileMenuOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
        >
          <nav className="flex flex-col space-y-2 py-4 border-t border-gray-200">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-app-shortcut={getNavigationShortcutByHref(link.href)?.display}
                aria-keyshortcuts={getNavigationShortcutByHref(link.href)?.aria}
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                {link.label}
              </Link>
            ))}
            <div className="px-3 py-2">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Collections</div>
              {topCollections.length > 0 ? (
                <>
                  {topCollections.map((ct) => (
                    <Link
                      key={ct.id}
                      href={`/custom-entities/${ct.slug}`}
                      className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      {ct.name}
                    </Link>
                  ))}
                  {hasMoreCollections && (
                    <Link
                      href="/collection-types"
                      className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      View All Collections
                    </Link>
                  )}
                </>
              ) : (
                <Link
                  href="/collection-types"
                  className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  View All Collections
                </Link>
              )}
            </div>
            <Button
              onClick={handleLogout}
              variant="destructive"
              size="sm"
              className="mt-2 w-max bg-red-700 hover:bg-red-800 focus-visible:ring-red-500/30"
            >
              Logout
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}
