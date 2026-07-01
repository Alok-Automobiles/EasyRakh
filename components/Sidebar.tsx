'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
  User,
  FileText,
  Settings,
  Boxes
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ThemeToggle from '@/components/ThemeToggle';

type SidebarProps = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const lastPathnameRef = useRef<string>('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [customCollectionTypes, setCustomCollectionTypes] = useState<Array<{ id: string; name: string; slug: string; lastTransactionDate?: Date }>>([]);
  const [expandedCollections, setExpandedCollections] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/';
  const effectiveCollapsed = isMobileOpen ? false : collapsed;

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    if (isAuthPage) {
      const timer = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(timer);
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
  }, [pathname, router, isAuthPage]);

  useEffect(() => {
    const timer = setTimeout(() => setIsMobileOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

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
    router.push('/');
    router.refresh();
  }, [router]);

  const navLinks = useMemo(() => [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/suppliers', label: 'Suppliers', icon: Building2 },
    { href: '/transactions/new', label: 'New Transaction', icon: PlusCircle },
    { href: '/invoices', label: 'Invoices', icon: FileText },
    { href: '/inventory', label: 'Inventory', icon: Boxes },
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
      <div
        className={`border-b border-gray-200 px-3 py-2.5 lg:px-3 lg:py-3 ${
          effectiveCollapsed
            ? 'flex flex-col items-center justify-center gap-2'
            : 'space-y-1.5'
        }`}
      >
        <div className="relative flex w-full items-center justify-center">
          <Link
            href="/?view=landing"
            className="flex min-w-0 items-center justify-center"
            aria-label="Go to home"
          >
            <Image
              src="/logo.png"
              alt="EasyRakh logo"
              width={effectiveCollapsed ? 32 : 86}
              height={effectiveCollapsed ? 32 : 54}
              className="theme-logo-surface shrink-0 rounded-md p-1"
            />
          </Link>
          <ThemeToggle
            className={`sidebar-theme-toggle h-8 w-8 rounded-lg ${
              effectiveCollapsed ? '' : 'absolute right-0 top-1/2 -translate-y-1/2'
            }`}
          />
        </div>
        {!effectiveCollapsed && (
          <Link href="/?view=landing" className="block min-w-0 text-center">
            <span className="block truncate text-[11px] leading-4 text-gray-500">
              Ek ek rupaye ka hisaab, ek screen par.
            </span>
          </Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 lg:px-3 lg:py-6 space-y-1 sidebar-scrollbar min-h-0">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center ${effectiveCollapsed ? 'justify-center px-3' : 'space-x-3 px-4'} py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
              {!effectiveCollapsed && <span>{link.label}</span>}
              {effectiveCollapsed && <span className="sr-only">{link.label}</span>}
            </Link>
          );
        })}

        {!effectiveCollapsed && (
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
            <div className="mt-2 space-y-1 pl-4 max-h-48 overflow-y-auto sidebar-scrollbar pr-1">
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
        )}
      </nav>

      <div className="shrink-0 p-3 lg:p-4 border-t border-gray-200 bg-gray-50">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button 
              className={`flex items-center ${effectiveCollapsed ? 'justify-center' : 'space-x-3 px-2'} rounded-lg hover:bg-gray-100 transition-colors py-2 cursor-pointer w-full text-left`}
              onMouseEnter={(e) => {
                if (isDesktop) {
                  e.currentTarget.click();
                }
              }}
            >
              <div className="shrink-0">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              {!effectiveCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" sideOffset={5}>
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Edit Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={handleLogout} 
              className="flex items-center cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 data-[highlighted]:bg-red-100 data-[highlighted]:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
    );
  }, [user, navLinks, pathname, customCollectionTypes, expandedCollections, isActive, handleLogout, effectiveCollapsed, isDesktop]);

  if (isAuthPage) {
    return null;
  }

  if (loading) {
    return (
      <>
        <button
          type="button"
          className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white shadow-lg border border-gray-200"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-gray-700" />
        </button>
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
      <div className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/95 px-3 shadow-sm backdrop-blur">
        <button
          type="button"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 transition-colors"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={isMobileOpen}
        >
          <Menu className="h-5 w-5 text-gray-700" />
        </button>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <Image
            src="/logo.png"
            alt="EasyRakh logo"
            width={34}
            height={34}
            className="theme-logo-surface shrink-0 rounded-lg p-1"
          />
          <span className="truncate text-sm font-black text-gray-950">EasyRakh</span>
        </Link>
        <ThemeToggle className="ml-auto h-9 w-9" />
      </div>

      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={`lg:hidden fixed left-0 top-0 h-[100dvh] w-[min(20rem,calc(100vw-1.25rem))] max-w-[calc(100vw-1.25rem)] bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-gray-700" />
          </button>
          {sidebarContent}
        </div>
      </aside>

      <aside
        className="hidden lg:flex fixed left-0 top-0 h-screen shrink-0 bg-white border-r border-gray-200 flex-col shadow-sm transition-[width] duration-300"
        style={{ width: effectiveCollapsed ? '5rem' : '16rem' }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
