'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Archive,
  Boxes,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { InventoryStats } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

interface InventoryListItem {
  id: string;
  itemName: string;
  itemNumber: string;
  quantity: number;
  location: string;
  unitOfMeasure: string;
  buyingPrice?: number;
  brand?: string;
}

interface InventoryResponse {
  stats: InventoryStats;
  lowStockItems: InventoryListItem[];
  pagination: {
    total: number;
  };
}

const defaultStats: InventoryStats = {
  totalItems: 0,
  totalQuantity: 0,
  totalValue: 0,
  outOfStockItems: 0,
  inactiveItems: 0,
  restockItems: 0,
  lowStockThreshold: 5,
  locations: [],
  brands: [],
};

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const StatCard = ({
  label,
  value,
  subtext,
  icon,
  tone,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  tone: string;
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-2 truncate text-2xl font-bold text-gray-950" title={value}>
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-gray-500" title={subtext}>
          {subtext}
        </p>
      </div>
      <div className={`rounded-lg p-2.5 ${tone}`}>{icon}</div>
    </div>
  </div>
);

export default function InventoryPage() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key !== 'n') return;
      // Ctrl/Cmd+N — capture phase helps; some browsers still reserve it (use Alt+N below).
      const ctrlOrCmdN =
        (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      const altN = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (!ctrlOrCmdN && !altN) return;

      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      router.push('/inventory-items?new=1');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [router]);

  const { data, isLoading } = useQuery<InventoryResponse>({
    queryKey: ['inventory-overview'],
    queryFn: async () => {
      const response = await fetch('/api/inventory?limit=8', { cache: 'no-store' });
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch inventory');
      return response.json();
    },
  });

  const stats = data?.stats || defaultStats;
  const lowStockItems = data?.lowStockItems || [];
  const inactiveItems = stats.inactiveItems || 0;
  const inStockItems = Math.max(stats.totalItems - stats.outOfStockItems - inactiveItems - stats.restockItems, 0);
  const stockSegments = [
    {
      label: 'Healthy',
      count: inStockItems,
      className: 'bg-emerald-500',
    },
    {
      label: 'Restock',
      count: stats.restockItems,
      className: 'bg-amber-500',
    },
    {
      label: 'Out',
      count: stats.outOfStockItems,
      className: 'bg-red-500',
    },
    {
      label: 'Inactive',
      count: inactiveItems,
      className: 'bg-gray-500',
    },
  ];
  const totalForSegments = Math.max(stats.totalItems, 1);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 space-y-6 [&_button:not(:disabled)]:cursor-pointer [&_a]:cursor-pointer"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-900 p-3 text-white shadow-sm">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">Inventory</h1>
            <p className="text-sm text-gray-500">
              Track stock quantity, value, location, supplier and buying codes.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="border-gray-300">
            <Link href="/inventory-items">
              Browse Items
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild className="bg-slate-900 text-white hover:bg-slate-800">
            <Link href="/inventory-items?new=1">
              <Plus className="h-4 w-4" />
              Add Item
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Items"
          value={stats.totalItems.toLocaleString('en-IN')}
          subtext={`${stats.totalQuantity.toLocaleString('en-IN')} total units`}
          icon={<Package className="h-5 w-5" />}
          tone="bg-blue-100 text-blue-700"
        />
        <StatCard
          label="Stock Value"
          value={formatCurrency(stats.totalValue)}
          subtext="Based on buying price"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          label="Out Of Stock"
          value={stats.outOfStockItems.toLocaleString('en-IN')}
          subtext="Zero for under 60 days"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="bg-red-100 text-red-700"
        />
        <StatCard
          label="Inactive"
          value={inactiveItems.toLocaleString('en-IN')}
          subtext="Zero stock for 60+ days"
          icon={<Archive className="h-5 w-5" />}
          tone="bg-gray-100 text-gray-700"
        />
        <StatCard
          label="Restock Items"
          value={stats.restockItems.toLocaleString('en-IN')}
          subtext={`Quantity 1-${stats.lowStockThreshold}`}
          icon={<ShoppingBag className="h-5 w-5" />}
          tone="bg-amber-100 text-amber-700"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Stock Health</p>
              <h2 className="mt-1 text-xl font-bold text-gray-950">Inventory status</h2>
            </div>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
              {stats.totalItems.toLocaleString('en-IN')} items tracked
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-full bg-gray-100">
            <div className="flex h-3 w-full">
              {stockSegments.map((segment) => (
                <div
                  key={segment.label}
                  className={segment.className}
                  style={{ width: `${(segment.count / totalForSegments) * 100}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {stockSegments.map((segment) => (
              <div key={segment.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${segment.className}`} />
                  <span className="text-sm font-semibold text-gray-800">{segment.label}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-950">{segment.count}</p>
                <p className="text-xs text-gray-500">
                  {Math.round((segment.count / totalForSegments) * 100)}% of inventory
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Buying price value</p>
            <p className="mt-1 text-sm text-emerald-800">
              Current stock value is calculated as quantity multiplied by buying price. Items without a buying price count as zero until filled in.
            </p>
          </div>
        </div>

        <div className="flex max-h-[min(26rem,62vh)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2 lg:max-h-[min(23rem,72vh)]">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Restock Queue</p>
              <h2 className="mt-1 text-xl font-bold text-gray-950">Low quantity items</h2>
            </div>
            <Button asChild size="sm" variant="outline" className="border-gray-300 shrink-0">
              <Link href="/inventory-items?status=low-stock">View all</Link>
            </Button>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-1">
            <div className="space-y-3">
              {lowStockItems.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
                  <Package className="mx-auto h-9 w-9 text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-600">No restock alerts right now.</p>
                </div>
              ) : (
                lowStockItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/inventory-items?search=${encodeURIComponent(item.itemNumber || item.itemName)}`}
                    className="block cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 transition-colors hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-950" title={item.itemName}>
                          {item.itemName}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {item.itemNumber
                            ? item.itemNumber
                            : <span className="italic text-gray-400">No item number</span>}
                          {item.brand ? ` • ${item.brand}` : ''}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 shrink-0">
                        {item.quantity} {item.unitOfMeasure}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.location}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {lowStockItems.length > 0 && stats.restockItems > lowStockItems.length ? (
            <p className="mt-3 shrink-0 border-t border-gray-100 pt-3 text-center text-xs text-gray-500">
              Showing top {lowStockItems.length} of {stats.restockItems.toLocaleString('en-IN')} low-stock items.{' '}
              <Link href="/inventory-items?status=low-stock" className="cursor-pointer font-semibold text-slate-800 underline-offset-2 hover:underline">
                Open full list
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      {/* <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Storage</p>
            <h2 className="mt-1 text-xl font-bold text-gray-950">Locations and brands</h2>
          </div>
          <Button asChild size="sm" variant="outline" className="border-gray-300">
            <Link href="/inventory-items">Manage Stock</Link>
          </Button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Locations</p>
            <div className="flex flex-wrap gap-2">
              {stats.locations.length === 0 ? (
                <span className="text-sm text-gray-400">No locations yet</span>
              ) : (
                stats.locations.slice(0, 12).map((location) => (
                  <span key={location} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                    {location}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Brands</p>
            <div className="flex flex-wrap gap-2">
              {stats.brands.length === 0 ? (
                <span className="text-sm text-gray-400">No brands yet</span>
              ) : (
                stats.brands.slice(0, 12).map((brand) => (
                  <span key={brand} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {brand}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div> */}
    </motion.div>
  );
}
