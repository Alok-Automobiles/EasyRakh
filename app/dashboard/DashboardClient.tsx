'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Plus,
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

type DashboardResponse = {
  stats: DashboardStats;
  activities: RecentActivity[];
  dashboardNotes: DashboardNote[];
  topCustomers: TopEntity[];
  topSuppliers: TopEntity[];
};

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
    <Card className="p-2 sm:p-3 lg:p-4 xl:p-5">
      <div className="flex items-start justify-between gap-1 sm:gap-2 lg:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-gray-500 truncate">{label}</p>
          <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1 lg:mt-2 tracking-tight wrap-break-word">{value}</p>
        </div>
        <div className={`p-1 sm:p-1.5 lg:p-2 xl:p-2.5 rounded-md sm:rounded-lg lg:rounded-xl shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </Card>
  </motion.div>
);

const EntityListItem = ({ entity }: { entity: TopEntity }) => (
  <div className="flex items-center justify-between rounded-lg sm:rounded-xl bg-gray-50 px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 border border-gray-200 transition-all hover:bg-gray-100">
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">{entity.name}</p>
      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">Debit {formatCurrency(entity.debit)} · Credit {formatCurrency(entity.credit)}</p>
    </div>
    <span className="text-xs sm:text-sm font-bold text-green-700 bg-green-100 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full shrink-0 ml-2">
      {formatCurrency(entity.total)}
    </span>
  </div>
);

const ActivityRow = ({
  activity,
  onClick,
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
      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4 p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl bg-gray-50 border border-gray-200 transition-all hover:bg-gray-100 w-full overflow-hidden">
        <div className={`w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-lg sm:rounded-xl flex items-center justify-center border shrink-0 ${getIconStyles()}`}>
          {getTypeIcon()}
        </div>

        <div className="flex-1 min-w-0 text-left overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <p className="font-semibold text-gray-900 truncate text-xs sm:text-sm lg:text-base">{activity.entityName}</p>
            {(isCustomerCreated || isSupplierCreated) && (
              <span className="px-1 sm:px-1.5 lg:px-2 py-0.5 text-[9px] sm:text-[10px] lg:text-xs font-medium rounded-full bg-gray-100 text-gray-500 shrink-0">
                New
              </span>
            )}
          </div>
          <p className="text-[10px] sm:text-xs lg:text-sm text-gray-500 truncate mt-0.5">{activity.description}</p>
        </div>

        <div className="text-right shrink-0 ml-1 sm:ml-2 lg:ml-3">
          {activity.amount !== undefined ? (
            <p className={`text-xs sm:text-sm lg:text-base font-bold ${isCredit ? 'text-green-700' : 'text-red-700'} wrap-break-word leading-tight`}>
              {isCredit ? '+' : '-'}₹{activity.amount.toLocaleString('en-IN')}
            </p>
          ) : (
            <p className="text-xs sm:text-sm font-medium text-gray-400">—</p>
          )}
          <p className="text-[9px] sm:text-[10px] lg:text-xs text-gray-400 mt-0.5 whitespace-nowrap">
            {format(new Date(activity.createdAt), 'MMM d, h:mm a')}
          </p>
        </div>
      </div>
    </button>
  );
};

const NoteCard = ({ note }: { note: DashboardNote }) => {
  const accentColor = note.color || '#1f2937';

  return (
    <div className="group relative rounded-lg sm:rounded-xl bg-gray-50 border border-gray-200 p-2 sm:p-3 lg:p-4 transition-all hover:bg-gray-100 hover:shadow-md overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />

      <div className="pl-2 sm:pl-3">
        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate text-xs sm:text-sm">{note.title}</h4>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">
              {format(new Date(note.updatedAt), 'MMM d, yyyy')}
            </p>
          </div>
          <div
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 mt-0.5 sm:mt-1"
            style={{ backgroundColor: accentColor }}
          />
        </div>
        <p className="text-xs sm:text-sm text-gray-600 mt-1.5 sm:mt-2 line-clamp-2 leading-relaxed">
          {note.content || 'No description provided.'}
        </p>
      </div>
    </div>
  );
};

export default function DashboardClient({ initialData }: { initialData?: DashboardResponse | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [activeEntityTab, setActiveEntityTab] = useState<'customers' | 'suppliers'>('customers');
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [entryType, setEntryType] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const activitiesPerPage = 5;

  // React Query for dashboard data - cached across navigation
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/stats', {
        cache: 'no-store',
      });
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      return response.json() as Promise<DashboardResponse>;
    },
    initialData: initialData || undefined,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const stats = data?.stats || defaultStats;
  const recentActivities = data?.activities || [];
  const dashboardNotes = data?.dashboardNotes || [];
  const topCustomers = data?.topCustomers || [];
  const topSuppliers = data?.topSuppliers || [];
  const loading = isLoading && !data;

  // Mutation for adding daily cash transactions with optimistic updates
  const addTransactionMutation = useMutation({
    mutationFn: async ({ amountNum, type, desc }: { amountNum: number; type: 'in' | 'out'; desc: string }) => {
      const dateString = format(new Date(), 'dd-MM-yyyy');
      const response = await fetch('/api/daily-cash-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, type, description: desc, date: dateString }),
      });
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add transaction');
      return result;
    },
    onMutate: async ({ amountNum, type }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });
      // Snapshot previous value
      const previousData = queryClient.getQueryData<DashboardResponse>(['dashboard']);
      // Optimistically update
      if (previousData) {
        queryClient.setQueryData<DashboardResponse>(['dashboard'], {
          ...previousData,
          stats: {
            ...previousData.stats,
            todayCash: {
              totalIn: previousData.stats.todayCash.totalIn + (type === 'in' ? amountNum : 0),
              totalOut: previousData.stats.todayCash.totalOut + (type === 'out' ? amountNum : 0),
              totalLeft: previousData.stats.todayCash.totalLeft + (type === 'in' ? amountNum : -amountNum),
            },
          },
        });
      }
      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['dashboard'], context.previousData);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to add transaction');
    },
    onSuccess: (data, variables) => {
      toast.success(`Money ${variables.type === 'in' ? 'added' : 'deducted'} successfully`);
      // Background refetch to sync activities, monthly totals, etc.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

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

  const resetAddTransactionForm = () => {
    setEntryType('in');
    setAmount('');
    setDescription('');
  };

  const handleAddTodayTransaction = () => {
    if (!amount || !description) {
      toast.error('Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Close dialog and reset form immediately for snappy UX
    const currentType = entryType;
    const currentDesc = description;
    resetAddTransactionForm();
    setAddTransactionOpen(false);

    // Fire mutation with optimistic update
    addTransactionMutation.mutate({ amountNum, type: currentType, desc: currentDesc });
  };

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
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="max-w-7xl mx-auto px-3 sm:px-4 lg:mx-0 lg:ml-0 lg:pl-6 lg:pr-6 xl:pl-8 xl:pr-8 py-1.5 sm:py-5 lg:py-8 space-y-3 sm:space-y-4 lg:space-y-6 w-full"
      >
        <motion.div variants={itemVariants} className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900 text-white shadow-lg shrink-0">
              <Wallet className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate leading-tight">Dashboard</h1>
              <p className="text-gray-500 text-[11px] sm:text-sm mt-0.5 truncate">
                <span className="hidden sm:inline">{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
                <span className="sm:hidden">{format(new Date(), 'MMM d, yyyy')}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-nowrap gap-2 sm:gap-2 lg:gap-3 w-full sm:w-auto">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-gray-300 hover:bg-gray-100 text-[11px] sm:text-xs lg:text-sm h-9 sm:h-8 lg:h-9 px-3 w-1/2 sm:w-auto basis-1/2 sm:basis-auto max-w-[50%] sm:max-w-none shrink-0"
            >
              <Link href="/notes" className="w-full text-center whitespace-nowrap">
                <span className="sm:hidden">Notes</span>
                <span className="hidden sm:inline">Manage Notes</span>
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] sm:text-xs lg:text-sm h-9 sm:h-8 lg:h-9 px-3 w-1/2 sm:w-auto basis-1/2 sm:basis-auto max-w-[50%] sm:max-w-none shrink-0"
            >
              <Link href="/transactions/new" className="w-full text-center whitespace-nowrap">
                <span className="sm:hidden">New Transaction</span>
                <span className="hidden sm:inline">Record Transaction</span>
              </Link>
            </Button>
          </div>
        </motion.div>

        <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-3">
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="p-2 sm:p-4 md:p-6 lg:p-8 h-full" hover={false}>
              <div className="flex flex-col h-full justify-between">
                <Dialog
                  open={addTransactionOpen}
                  onOpenChange={(open) => {
                    setAddTransactionOpen(open);
                    if (!open) {
                      resetAddTransactionForm();
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-slate-700 uppercase tracking-wider mb-1 sm:mb-2 lg:mb-3">
                        Today&apos;s Cash Position
                      </p>
                      <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 tracking-tight wrap-break-word">
                        {formatCurrency(stats.todayCash.totalLeft)}
                      </p>
                      <p className="text-[10px] sm:text-xs lg:text-sm text-gray-500 mt-0.5 sm:mt-1 lg:mt-2">
                        Final balance as of {format(new Date(), 'h:mm a')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          className="bg-slate-900 hover:bg-slate-800 text-white h-9 sm:h-9"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Transaction
                        </Button>
                      </DialogTrigger>
                      <Link
                        href="/daily-cash-record"
                        className="text-[11px] sm:text-xs text-blue-700 hover:text-blue-800 underline-offset-4 hover:underline"
                      >
                        View daily cash record
                      </Link>
                    </div>
                  </div>

                  <DialogContent className="max-w-[90vw] sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add today&apos;s cash transaction</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Transaction type *</Label>
                        <Select
                          value={entryType}
                          onValueChange={(value: 'in' | 'out') => setEntryType(value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in">Money In</SelectItem>
                            <SelectItem value="out">Money Out</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="today-amount">Amount *</Label>
                        <Input
                          id="today-amount"
                          type="number"
                          inputMode="decimal"
                          placeholder="Enter amount"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="today-description">Description *</Label>
                        <Input
                          id="today-description"
                          placeholder="Enter description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label>Date</Label>
                        <Input
                          value={format(new Date(), 'dd-MM-yyyy')}
                          readOnly
                          className="bg-gray-50"
                        />
                      </div>

                      <Button
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                        onClick={handleAddTodayTransaction}
                        disabled={addTransactionMutation.isPending}
                      >
                        {addTransactionMutation.isPending ? 'Adding...' : 'Add Transaction'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="flex flex-wrap gap-1.5 sm:gap-3 lg:gap-4 mt-3 sm:mt-4 lg:mt-6">
                  <div className="rounded-lg sm:rounded-xl lg:rounded-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 flex-1 min-w-0 sm:min-w-[140px] lg:min-w-[160px] bg-green-100">
                    <div className="flex items-center gap-1 sm:gap-2 text-green-700 mb-0.5 sm:mb-1">
                      <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 shrink-0" />
                      <span className="text-[9px] sm:text-[10px] lg:text-xs font-semibold uppercase tracking-wide">Cash In</span>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-green-700 wrap-break-word leading-tight">
                      {formatCurrency(stats.todayCash.totalIn)}
                    </p>
                  </div>
                  <div className="rounded-lg sm:rounded-xl lg:rounded-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 flex-1 min-w-0 sm:min-w-[140px] lg:min-w-[160px] bg-red-100">
                    <div className="flex items-center gap-1 sm:gap-2 text-red-700 mb-0.5 sm:mb-1">
                      <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 shrink-0" />
                      <span className="text-[9px] sm:text-[10px] lg:text-xs font-semibold uppercase tracking-wide">Cash Out</span>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-red-700 wrap-break-word leading-tight">
                      {formatCurrency(stats.todayCash.totalOut)}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="p-3 sm:p-4 lg:p-5 h-full">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div>
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Notes</p>
                  <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 mt-0.5">Pinned Notes</h3>
                </div>
                <Button asChild size="sm" variant="outline" className="border-gray-300 hover:bg-gray-100 h-7 sm:h-8 text-[10px] sm:text-xs px-2">
                  <Link href="/notes">Manage</Link>
                </Button>
              </div>

              <div className="space-y-2 sm:space-y-2.5 max-h-[180px] sm:max-h-[200px] overflow-y-auto hide-scrollbar">
                {dashboardNotes.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 sm:p-6 text-center text-gray-400">
                    <StickyNote className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 opacity-50" strokeWidth={1} />
                    <p className="text-[10px] sm:text-xs">No notes pinned</p>
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

        <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
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

        <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-5">
          <motion.div variants={itemVariants} className="lg:col-span-3">
            <Card className="p-3 sm:p-4 lg:p-6 h-full">
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
                <div>
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">30-Day Trend</p>
                  <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">Monthly Sales Overview</h3>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 text-[10px] sm:text-xs">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-700" />
                    <span className="text-gray-600">Cash In</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-700" />
                    <span className="text-gray-600">Cash Out</span>
                  </div>
                </div>
              </div>
              <div className="h-48 sm:h-60 lg:h-72 w-full overflow-hidden">
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
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
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

          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="p-3 sm:p-4 lg:p-6 h-full">
              <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-6">
                <div>
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">This Month</p>
                  <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">Monthly Summary</h3>
                </div>
                <span className="px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 rounded-full bg-green-100 text-green-700 text-[9px] sm:text-[10px] lg:text-xs font-semibold whitespace-nowrap">
                  {formatCurrency(stats.monthlyTotals.totalLeft)} net
                </span>
              </div>

              <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                <div className="flex items-center justify-between p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-green-100 text-green-700">
                      <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-gray-500">Total Cash In</p>
                      <p className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">{formatCurrency(stats.monthlyTotals.totalIn)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-red-100 text-red-700">
                      <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs text-gray-500">Total Cash Out</p>
                      <p className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">{formatCurrency(stats.monthlyTotals.totalOut)}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 sm:pt-3 lg:pt-4 border-t border-gray-200/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm text-gray-500">Net Balance</span>
                    <span className={`text-lg sm:text-xl lg:text-2xl font-bold ${stats.monthlyTotals.totalLeft >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(stats.monthlyTotals.totalLeft)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
          <Card className="p-3 sm:p-4 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Leaderboard</p>
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">Top Performers</h3>
              </div>
              <div className="flex rounded-lg sm:rounded-xl bg-gray-100 p-0.5 sm:p-1 border border-gray-200">
                <button
                  onClick={() => setActiveEntityTab('customers')}
                  className={`px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    activeEntityTab === 'customers'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Customers
                </button>
                <button
                  onClick={() => setActiveEntityTab('suppliers')}
                  className={`px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    activeEntityTab === 'suppliers'
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Suppliers
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3 min-h-[160px] sm:min-h-[180px]">
              {(activeEntityTab === 'customers' ? topCustomers : topSuppliers).length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-400">
                  <p className="text-sm">No {activeEntityTab} data available yet.</p>
                </div>
              ) : (
                (activeEntityTab === 'customers' ? topCustomers : topSuppliers).map((entity) => (
                  <div key={entity.id} className="h-full min-h-[120px]">
                    <EntityListItem entity={entity} />
                  </div>
                ))
              )}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="p-3 sm:p-4 lg:p-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4 lg:mb-6">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Activity Feed</p>
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1">Recent Transactions</h3>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1">
                  {recentActivities.length} total records
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="border-gray-300 hover:bg-gray-100 text-xs lg:text-sm h-8 lg:h-9 px-2 sm:px-3 lg:px-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
