'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  PlusCircle, 
  Wallet, 
  StickyNote, 
  ChevronDown, 
  ChevronRight,
  Menu,
  X,
  LogOut,
  FolderOpen,
  User
} from 'lucide-react';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const lastPathnameRef = useRef<string>('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [customCollectionTypes, setCustomCollectionTypes] = useState<Array<{ id: string; name: string; slug: string; lastTransactionDate?: Date }>>([]);
  const [expandedCollections, setExpandedCollections] = useState(false);

  // Don't show sidebar on login/register pages or landing page
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';

  useEffect(() => {
    if (isAuthPage) {
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
    }

    // Prevent duplicate calls for the same pathname
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
          
          // Create a map of collection slugs to their most recent transaction date
          const collectionLastTransactionMap = new Map<string, Date>();
          
          transactions.forEach((tx: { entityType: string; date: string | Date; createdAt: string | Date }) => {
            // Only process custom entity types (not 'customer' or 'supplier')
            if (tx.entityType && tx.entityType !== 'customer' && tx.entityType !== 'supplier') {
              const txDate = new Date(tx.date || tx.createdAt);
              const existing = collectionLastTransactionMap.get(tx.entityType);
              if (!existing || txDate > existing) {
                collectionLastTransactionMap.set(tx.entityType, txDate);
              }
            }
          });
          
          // Add last transaction date to each collection and sort by most recent
          const collectionsWithDates = collections.map((ct: { id: string; name: string; slug: string }) => ({
            ...ct,
            lastTransactionDate: collectionLastTransactionMap.get(ct.slug),
          }));
          
          // Sort: collections with recent transactions first, then by creation date
          collectionsWithDates.sort((a: { id: string; name: string; slug: string; lastTransactionDate?: Date }, b: { id: string; name: string; slug: string; lastTransactionDate?: Date }) => {
            if (a.lastTransactionDate && b.lastTransactionDate) {
              return b.lastTransactionDate.getTime() - a.lastTransactionDate.getTime();
            }
            if (a.lastTransactionDate) return -1;
            if (b.lastTransactionDate) return 1;
            return 0; // Keep original order if neither has transactions
          });
          
          setCustomCollectionTypes(collectionsWithDates);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pathname, router, isAuthPage]);

  useEffect(() => {
    // Close mobile menu when pathname changes
    const timer = setTimeout(() => setIsMobileOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }, [router]);

  const navLinks = useMemo(() => [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/suppliers', label: 'Suppliers', icon: Building2 },
    { href: '/transactions/new', label: 'New Transaction', icon: PlusCircle },
    { href: '/daily-cash-record', label: 'Cash Record', icon: Wallet },
    { href: '/notes', label: 'Notes', icon: StickyNote },
  ], []);

  const isActive = useCallback((href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  }, [pathname]);

  const sidebarContent = useMemo(() => {
    if (!user) return null;
    
    return (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <Link href="/" className="flex items-center space-x-3">
          <Image
            src="/logo.png"
            alt="EasyRakh logo"
            width={40}
            height={40}
            className="rounded-full bg-white p-1 shadow-sm"
          />
          <div className="flex flex-col">
            <span className="text-xl font-bold text-gray-900">
              Easy<span className="text-blue-600">Rakh</span>
            </span>
            <span className="text-xs text-gray-500">Ledger Management</span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1 sidebar-scrollbar min-h-0">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
              <span>{link.label}</span>
            </Link>
          );
        })}

        {/* Collections Section */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <button
            onClick={() => setExpandedCollections(!expandedCollections)}
            className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all duration-200"
          >
            <div className="flex items-center space-x-3">
              <FolderOpen className="h-5 w-5 text-gray-500" />
              <span>Collections</span>
            </div>
            {expandedCollections ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </button>

          {expandedCollections && (
            <div className="mt-2 space-y-1 pl-4">
              {customCollectionTypes.length > 0 ? (
                <>
                  {customCollectionTypes.slice(0, 5).map((ct) => {
                    const active = pathname.startsWith(`/custom-entities/${ct.slug}`);
                    return (
                      <Link
                        key={ct.id}
                        href={`/custom-entities/${ct.slug}`}
                        className={`block px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        {ct.name}
                      </Link>
                    );
                  })}
                  <Link
                    href="/collection-types"
                    className="block px-4 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 font-medium"
                  >
                    {customCollectionTypes.length > 5 
                      ? `View All (${customCollectionTypes.length})` 
                      : 'Manage Collections'}
                  </Link>
                </>
              ) : (
                <Link
                  href="/collection-types"
                  className="block px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
                >
                  Manage Collections
                </Link>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-3 mb-3 px-2">
          <div className="shrink-0">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <Button
          onClick={handleLogout}
          variant="destructive"
          size="sm"
          className="w-full bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/30"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </>
    );
  }, [user, navLinks, pathname, customCollectionTypes, expandedCollections, isActive, handleLogout]);

  if (isAuthPage) {
    return null;
  }

  if (loading) {
    return (
      <>
        {/* Mobile menu button */}
        <button
          type="button"
          className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white shadow-lg border border-gray-200"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-gray-700" />
        </button>
        {/* Sidebar skeleton */}
        <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </aside>
      </>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed left-0 top-0 h-screen w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
            <Link href="/" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors">
              Easy<span className="text-blue-600">Rakh</span>
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5 text-gray-700" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scrollbar min-h-0">
            {sidebarContent}
          </div>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex-col shadow-sm">
        {sidebarContent}
      </aside>
    </>
  );
}

