'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RecentActivity } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  Truck,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Building2,
  ClipboardList,
  StickyNote,
  BarChart3,
} from 'lucide-react';

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

// Animation variants for staggered children
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut' as const,
    },
  },
};


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
    <div className="rounded-xl p-4 shadow-xl border border-gray-200 bg-white">
      <p className="text-sm font-semibold text-gray-900 mb-3">
        {format(new Date(point.dateISO), 'EEEE, MMM d')}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-700" />
          <span className="text-xs text-gray-600">Cash In:</span>
          <span className="text-xs font-semibold text-green-700">{formatCurrency(point.totalIn)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-700" />
          <span className="text-xs text-gray-600">Cash Out:</span>
          <span className="text-xs font-semibold text-red-700">{formatCurrency(point.totalOut)}</span>
        </div>
      </div>
    </div>
  );
};

// Card component
const Card = ({
  children,
  className = '',
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) => (
  <div
    className={`rounded-xl shadow-md border border-gray-200 bg-white ${hover ? 'hover:shadow-lg transition-shadow' : ''} ${className}`}
  >
    {children}
  </div>
);

// Stat Card with Icon
const StatCard = ({
  label,
  value,
  icon,
  iconBg,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  delay?: number;
}) => (
  <motion.div
    variants={itemVariants}
    custom={delay}
  >
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-2 tracking-tight">{value}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          {icon}
        </div>
      </div>
    </Card>
  </motion.div>
);

// Entity List Item
const EntityListItem = ({ entity }: { entity: TopEntity }) => (
  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 border border-gray-200 transition-all hover:bg-gray-100">
    <div>
      <p className="font-semibold text-gray-900">{entity.name}</p>
      <p className="text-xs text-gray-500 mt-0.5">Debit {formatCurrency(entity.debit)} · Credit {formatCurrency(entity.credit)}</p>
    </div>
    <span className="text-sm font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">
      {formatCurrency(entity.total)}
    </span>
  </div>
);

// Activity Row - Compact glass-styled activity item
const ActivityRow = ({ 
  activity, 
  onClick 
}: { 
  activity: RecentActivity; 
  onClick: () => void;
}) => {
  const isCredit = activity.transactionType === 'credit';
  const isCustomerCreated = activity.type === 'customer_created';
  const isSupplierCreated = activity.type === 'supplier_created';
  
  const getTypeIcon = () => {
    if (isCustomerCreated) return <UserPlus className="w-5 h-5" />;
    if (isSupplierCreated) return <Building2 className="w-5 h-5" />;
    return isCredit ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />;
  };
  
  const getIconStyles = () => {
    if (isCustomerCreated) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (isSupplierCreated) return 'bg-purple-100 text-purple-700 border-purple-200';
    return isCredit 
      ? 'bg-green-100 text-green-700 border-green-200' 
      : 'bg-red-100 text-red-700 border-red-200';
  };

  const disabled = !(activity.entityType && activity.entityId);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full group ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-200 transition-all hover:bg-gray-100">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${getIconStyles()}`}>
          {getTypeIcon()}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{activity.entityName}</p>
            {(isCustomerCreated || isSupplierCreated) && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
                New
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{activity.description}</p>
        </div>
        
        {/* Amount & Time */}
        <div className="text-right shrink-0">
          {activity.amount !== undefined ? (
            <p className={`text-base font-bold ${isCredit ? 'text-green-700' : 'text-red-700'}`}>
              {isCredit ? '+' : '-'}₹{activity.amount.toLocaleString('en-IN')}
            </p>
          ) : (
            <p className="text-sm font-medium text-gray-400">—</p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {format(new Date(activity.createdAt), 'MMM d, h:mm a')}
          </p>
        </div>
      </div>
    </button>
  );
};

// Note Card - with color accent
const NoteCard = ({ note }: { note: DashboardNote }) => {
  // Convert hex/rgb color to a subtle tint
  const accentColor = note.color || '#1f2937';
  
  return (
    <div
      className="group relative rounded-xl bg-gray-50 border border-gray-200 p-4 transition-all hover:bg-gray-100 hover:shadow-md overflow-hidden"
    >
      {/* Color accent bar */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />
      
      {/* Content */}
      <div className="pl-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{note.title}</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              {format(new Date(note.updatedAt), 'MMM d, yyyy')}
            </p>
          </div>
          <div 
            className="w-3 h-3 rounded-full shrink-0 mt-1"
            style={{ backgroundColor: accentColor }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2 line-clamp-2 leading-relaxed">
          {note.content || 'No description provided.'}
        </p>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [dashboardNotes, setDashboardNotes] = useState<DashboardNote[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopEntity[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<TopEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeEntityTab, setActiveEntityTab] = useState<'customers' | 'suppliers'>('customers');
  const activitiesPerPage = 5;
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
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-slate-900 text-white shadow-lg">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="border-gray-300 hover:bg-gray-100 text-sm">
              <Link href="/notes">Manage Notes</Link>
            </Button>
            <Button asChild className="bg-slate-900 hover:bg-slate-800 text-white text-sm">
              <Link href="/transactions/new">Record Transaction</Link>
            </Button>
          </div>
        </motion.div>

        {/* Hero Cash Flow Card + Notes Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Hero Cash Flow Card */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="p-6 md:p-8 h-full" hover={false}>
              <div className="flex flex-col h-full justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 uppercase tracking-wider mb-2">
                    Today&apos;s Cash Position
                  </p>
          <p className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">
                    {formatCurrency(stats.todayCash.totalLeft)}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Final balance as of {format(new Date(), 'h:mm a')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 mt-6">
                  <div className="rounded-2xl px-6 py-4 min-w-[160px] bg-green-100">
                    <div className="flex items-center gap-2 text-green-700 mb-1">
                      <ArrowUpRight className="w-5 h-5" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Cash In</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(stats.todayCash.totalIn)}
                    </p>
                  </div>
                  <div className="rounded-2xl px-6 py-4 min-w-[160px] bg-red-100">
                    <div className="flex items-center gap-2 text-red-700 mb-1">
                      <ArrowDownRight className="w-5 h-5" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Cash Out</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">
                      {formatCurrency(stats.todayCash.totalOut)}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Dashboard Notes - Top Right */}
          <motion.div variants={itemVariants}>
            <Card className="p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Notes</p>
                  <h3 className="text-lg font-bold text-gray-900 mt-0.5">Pinned Notes</h3>
                </div>
                <Button asChild size="sm" variant="outline" className="border-gray-300 hover:bg-gray-100 h-8 text-xs">
                  <Link href="/notes">Manage</Link>
                </Button>
              </div>

              <div className="space-y-2.5 max-h-[200px] overflow-y-auto hide-scrollbar">
                {dashboardNotes.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center text-gray-400">
                    <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" strokeWidth={1} />
                    <p className="text-xs">No notes pinned</p>
                  </div>
                ) : (
                  dashboardNotes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))
                )}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Stat Cards Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Customers"
            value={stats.totalCustomers.toString()}
            icon={<Users className="w-5 h-5" />}
            iconBg="bg-blue-100 text-blue-700"
            delay={0}
          />
          <StatCard
            label="Total Suppliers"
            value={stats.totalSuppliers.toString()}
            icon={<Truck className="w-5 h-5" />}
            iconBg="bg-purple-100 text-purple-700"
            delay={1}
          />
          <StatCard
            label="Total Credit"
            value={formatCurrency(stats.totalCredit)}
            icon={<TrendingUp className="w-5 h-5" />}
            iconBg="bg-green-100 text-green-700"
            delay={2}
          />
          <StatCard
            label="Total Debit"
            value={formatCurrency(stats.totalDebit)}
            icon={<TrendingDown className="w-5 h-5" />}
            iconBg="bg-red-100 text-red-700"
            delay={3}
          />
        </div>

        {/* Chart and Monthly Summary Row */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Sales Chart */}
          <motion.div variants={itemVariants} className="lg:col-span-3">
            <Card className="p-6 h-full">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">30-Day Trend</p>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Monthly Sales Overview</h3>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-700" />
                    <span className="text-gray-600">Cash In</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-700" />
                    <span className="text-gray-600">Cash Out</span>
                  </div>
                </div>
              </div>
              <div className="h-72">
                {chartData.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-gray-400">
                    <BarChart3 className="w-12 h-12 mb-3 opacity-50" strokeWidth={1} />
                    <p className="text-sm">No sales data for this period</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#15803d" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#15803d" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#b91c1c" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <RechartsTooltip content={<SalesTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="totalIn"
                        stroke="#15803d"
                        fill="url(#colorIn)"
                        strokeWidth={2.5}
                        name="Cash In"
                      />
                      <Area
                        type="monotone"
                        dataKey="totalOut"
                        stroke="#b91c1c"
                        fill="url(#colorOut)"
                        strokeWidth={2.5}
                        name="Cash Out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Monthly Summary */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="p-6 h-full">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">This Month</p>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Monthly Summary</h3>
                </div>
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                  {formatCurrency(stats.monthlyTotals.totalLeft)} net
                </span>
              </div>

              <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-green-50 border border-green-200">
                  <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 text-green-700">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Cash In</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(stats.monthlyTotals.totalIn)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-red-50 border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-100 text-red-700">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Cash Out</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(stats.monthlyTotals.totalOut)}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Net Balance</span>
                    <span className={`text-2xl font-bold ${stats.monthlyTotals.totalLeft >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(stats.monthlyTotals.totalLeft)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Top Entities - Tabbed Card */}
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Leaderboard</p>
                <h3 className="text-xl font-bold text-gray-900 mt-1">Top Performers</h3>
              </div>
            <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200">
                <button
                  onClick={() => setActiveEntityTab('customers')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeEntityTab === 'customers'
                    ? 'bg-white shadow-sm text-slate-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Customers
                </button>
                <button
                  onClick={() => setActiveEntityTab('suppliers')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeEntityTab === 'suppliers'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Suppliers
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(activeEntityTab === 'customers' ? topCustomers : topSuppliers).length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-400">
                  <p className="text-sm">No {activeEntityTab} data available yet.</p>
                </div>
              ) : (
                (activeEntityTab === 'customers' ? topCustomers : topSuppliers).map((entity) => (
                  <EntityListItem key={entity.id} entity={entity} />
                ))
              )}
            </div>
          </Card>
        </motion.div>

        {/* Recent Activities - Full Width */}
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Activity Feed</p>
                <h3 className="text-xl font-bold text-gray-900 mt-1">Recent Transactions</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {recentActivities.length} total records
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="border-gray-300 hover:bg-gray-100">
                <Link href="/transactions/new">Add Activity</Link>
              </Button>
            </div>

            {recentActivities.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" strokeWidth={1} />
                <p className="text-sm">No activities yet. Start by recording a transaction.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  {visibleActivities.map((activity) => (
                    <ActivityRow 
                      key={activity.id} 
                      activity={activity}
                      onClick={() => {
                        if (activity.entityType && activity.entityId) {
                          router.push(`/ledger/${activity.entityType}/${activity.entityId}`);
                        }
                      }}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <Button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                      variant="outline"
                      size="sm"
                      className="border-gray-300"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let page: number;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (currentPage <= 3) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={page}
                            onClick={() => handlePageClick(page)}
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="sm"
                            className={`min-w-[36px] ${currentPage !== page ? 'border-gray-300' : ''}`}
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      variant="outline"
                      size="sm"
                      className="border-gray-300"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
