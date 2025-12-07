'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion } from 'motion/react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ActivityCard from '@/components/ActivityCard';
import { RecentActivity } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

interface CashSummary {
  totalIn: number;
  totalOut: number;
  totalLeft: number;
}

interface MonthlyPoint {
  dateLabel: string;
  totalIn: number;
  totalOut: number;
  totalLeft: number;
}

interface DashboardNote {
  id: string;
  title: string;
  content: string;
  color: string;
  updatedAt: string;
}

interface TopEntity {
  id: string;
  name: string;
  total: number;
  credit: number;
  debit: number;
}

interface DashboardStats {
  totalCredit: number;
  totalDebit: number;
  netBalance: number;
  totalCustomers: number;
  totalSuppliers: number;
  totalTransactions: number;
  todayCash: CashSummary;
  monthlyTotals: CashSummary;
  monthlySeries: MonthlyPoint[];
}

const defaultStats: DashboardStats = {
  totalCredit: 0,
  totalDebit: 0,
  netBalance: 0,
  totalCustomers: 0,
  totalSuppliers: 0,
  totalTransactions: 0,
  todayCash: { totalIn: 0, totalOut: 0, totalLeft: 0 },
  monthlyTotals: { totalIn: 0, totalOut: 0, totalLeft: 0 },
  monthlySeries: [],
};

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

type SalesTooltipPoint = {
  label: string;
  totalIn: number;
  totalOut: number;
  dateISO: string;
};

interface SalesTooltipProps {
  active?: boolean;
  payload?: { payload: SalesTooltipPoint }[];
}

const SalesTooltip = ({ active, payload }: SalesTooltipProps) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-lg border bg-white/80 p-3 shadow-md backdrop-blur-sm">
      <p className="text-sm font-semibold text-gray-900 mb-2">
        {format(new Date(point.dateISO), 'MMM d, yyyy')}
      </p>
      <p className="text-xs text-gray-600">Cash In: {formatCurrency(point.totalIn)}</p>
      <p className="text-xs text-gray-600">Cash Out: {formatCurrency(point.totalOut)}</p>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) => (
  <Card className="border-none bg-white shadow-sm">
    <CardContent className="p-6">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
      {helper && <p className="text-xs text-emerald-600 mt-1">{helper}</p>}
    </CardContent>
  </Card>
);

const TopEntityList = ({
  title,
  entities,
}: {
  title: string;
  entities: TopEntity[];
}) => (
  <Card className="h-full border-none shadow-sm">
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {entities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available yet.</p>
      ) : (
        entities.map((entity) => (
          <div
            key={entity.id}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
          >
            <div>
              <p className="font-semibold text-gray-900">{entity.name}</p>
              <p className="text-xs text-gray-500">
                Debit {formatCurrency(entity.debit)} · Credit {formatCurrency(entity.credit)}
              </p>
            </div>
            <span className="text-sm font-semibold text-emerald-600">
              {formatCurrency(entity.total)}
            </span>
          </div>
        ))
      )}
    </CardContent>
  </Card>
);

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [dashboardNotes, setDashboardNotes] = useState<DashboardNote[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopEntity[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<TopEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const activitiesPerPage = 7;
  const hasFetchedRef = useRef(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/stats');

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();

      setStats(data.stats || defaultStats);
      setRecentActivities(data.activities || []);
      setDashboardNotes(data.dashboardNotes || []);
      setTopCustomers(data.topCustomers || []);
      setTopSuppliers(data.topSuppliers || []);
    } catch {
      toast.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [recentActivities.length]);

  const totalPages = Math.ceil(recentActivities.length / activitiesPerPage) || 1;
  const startIndex = (currentPage - 1) * activitiesPerPage;
  const endIndex = startIndex + activitiesPerPage;
  const visibleActivities = recentActivities.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
  };

  const chartData = (stats.monthlySeries || []).map((point) => ({
    label: format(new Date(point.dateLabel), 'MMM d'),
    totalIn: point.totalIn,
    totalOut: point.totalOut,
    dateISO: point.dateLabel,
  }));

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.3 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-8">
            <div>
              <Skeleton className="h-9 w-48 mb-2" />
              <Skeleton className="h-5 w-64" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.3 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wider text-emerald-600">Overview</p>
            <h1 className="text-4xl font-bold text-gray-900 mt-1">Dashboard</h1>
            <p className="text-gray-500 mt-2">
              Plan, prioritize, and track every supplier & customer interaction in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/notes">Manage Notes</Link>
            </Button>
            <Button asChild>
              <Link href="/transactions/new">Record Transaction</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Customers" value={stats.totalCustomers.toString()} />
          <StatCard label="Total Suppliers" value={stats.totalSuppliers.toString()} />
          <StatCard label="Total Credit" value={formatCurrency(stats.totalCredit)} />
          <StatCard label="Total Debit" value={formatCurrency(stats.totalDebit)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">30-Day Sales Trend</p>
                <CardTitle className="text-2xl">Monthly Sales</CardTitle>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {formatCurrency(stats.monthlyTotals.totalIn)}
              </span>
            </CardHeader>
            <CardContent className="h-72">
              {chartData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <p>No sales data for this period.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <RechartsTooltip content={<SalesTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="totalIn"
                      stroke="#059669"
                      fill="url(#colorIn)"
                      strokeWidth={2}
                      name="Cash In"
                    />
                    <Area
                      type="monotone"
                      dataKey="totalOut"
                      stroke="#dc2626"
                      fill="url(#colorOut)"
                      strokeWidth={2}
                      name="Cash Out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Today&apos;s Cash Flow</CardTitle>
                <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
                  <div>
                    <p className="text-sm text-emerald-600">Cash In</p>
                    <p className="text-2xl font-semibold text-emerald-700">
                      {formatCurrency(stats.todayCash.totalIn)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-rose-50 px-4 py-3">
                  <div>
                    <p className="text-sm text-rose-600">Cash Out</p>
                    <p className="text-2xl font-semibold text-rose-700">
                      {formatCurrency(stats.todayCash.totalOut)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-600">Final Balance</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(stats.todayCash.totalLeft)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Monthly Totals</CardTitle>
                  <p className="text-sm text-muted-foreground">Based on daily cash entries</p>
                </div>
                <span className="text-xs text-emerald-600">
                  {formatCurrency(stats.monthlyTotals.totalLeft)} net
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Cash In</span>
                  <span className="text-base font-semibold text-gray-900">
                    {formatCurrency(stats.monthlyTotals.totalIn)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Cash Out</span>
                  <span className="text-base font-semibold text-gray-900">
                    {formatCurrency(stats.monthlyTotals.totalOut)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-gray-500">Balance</span>
                  <span className="text-lg font-semibold text-emerald-600">
                    {formatCurrency(stats.monthlyTotals.totalLeft)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <TopEntityList title="Top Customers" entities={topCustomers} />
          <TopEntityList title="Top Suppliers" entities={topSuppliers} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-none shadow-sm xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Activities</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Showing {activitiesPerPage} per page · {recentActivities.length} total records
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/transactions/new">Add Activity</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentActivities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activities yet. Start by recording a transaction.
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {visibleActivities.map((activity) => (
                      <ActivityCard key={activity.id} activity={activity} />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between">
                      <Button
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                        variant="outline"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            onClick={() => handlePageClick(page)}
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="sm"
                            className="min-w-[40px]"
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                      <Button
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                        variant="outline"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Dashboard Notes</CardTitle>
                <p className="text-sm text-muted-foreground">Pinned from notes module</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/notes">Manage</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {dashboardNotes.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                  No notes selected. Use “Add to dashboard” toggle inside your notes.
                </div>
              ) : (
                dashboardNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-2xl p-4 text-gray-900 shadow"
                    style={{ backgroundColor: note.color }}
                  >
                    <p className="text-xs text-black/70">
                      {format(new Date(note.updatedAt), 'MMM d, yyyy')}
                    </p>
                    <h4 className="text-lg font-semibold mt-1">{note.title}</h4>
                    <p className="text-sm mt-2 line-clamp-3 text-black/80">
                      {note.content || 'No description provided.'}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}


