'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Upload,
  FileText,
  X,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Boxes,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react';
import { compressImage, isCompressibleImage, formatFileSize } from '@/lib/imageCompression';
import GlobalSearch from '@/components/GlobalSearch';
import { Calendar } from '@/components/ui/calendar';

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_BILL_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
];

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
  inventory: {
    totalItems: number;
    totalQuantity: number;
    totalValue: number;
    outOfStockItems: number;
    restockItems: number;
    lowStockThreshold: number;
  };
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
  periodLabel?: string;
};

const defaultStats: DashboardStats = {
  totalCredit: 0,
  totalDebit: 0,
  netBalance: 0,
  totalCustomers: 0,
  totalSuppliers: 0,
  totalTransactions: 0,
  inventory: {
    totalItems: 0,
    totalQuantity: 0,
    totalValue: 0,
    outOfStockItems: 0,
    restockItems: 0,
    lowStockThreshold: 5,
  },
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

type FilterMode = 'month' | 'dateRange';

const SalesChart = dynamic(() => import('./SalesChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});

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
    className="min-w-0"
  >
    <Card className="p-2 sm:p-3 lg:p-4 xl:p-5 overflow-hidden">
      <div className="flex items-start justify-between gap-1 sm:gap-2 lg:gap-3 min-w-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[9px] sm:text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-gray-500 truncate">{label}</p>
          <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-gray-900 mt-0.5 sm:mt-1 lg:mt-2 tracking-tight wrap-break-word overflow-hidden" title={value}>{value}</p>
        </div>
        <div className={`p-1 sm:p-1.5 lg:p-2 xl:p-2.5 rounded-md sm:rounded-lg lg:rounded-xl shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>
    </Card>
  </motion.div>
);

const EntityListItem = ({ entity }: { entity: TopEntity }) => (
  <div className="flex items-center justify-between gap-2 rounded-lg sm:rounded-xl bg-gray-50 px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 border border-gray-200 transition-all hover:bg-gray-100 min-w-0">
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900 text-sm sm:text-base truncate" title={entity.name}>{entity.name}</p>
      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate" title={`Debit ${formatCurrency(entity.debit)} · Credit ${formatCurrency(entity.credit)}`}>Debit {formatCurrency(entity.debit)} · Credit {formatCurrency(entity.credit)}</p>
    </div>
    <span className="text-xs sm:text-sm font-bold text-green-700 bg-green-100 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full shrink-0 truncate max-w-[90px] sm:max-w-[110px]" title={formatCurrency(entity.total)}>
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

        <div className="text-right shrink-0 ml-1 sm:ml-2 lg:ml-3 min-w-0 max-w-[100px] sm:max-w-[120px]">
          {activity.amount !== undefined ? (
            <p className={`text-xs sm:text-sm lg:text-base font-bold truncate ${isCredit ? 'text-green-700' : 'text-red-700'} leading-tight`} title={`${isCredit ? '+' : '-'}₹${activity.amount.toLocaleString('en-IN')}`}>
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

export default function DashboardClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [activeEntityTab, setActiveEntityTab] = useState<'customers' | 'suppliers'>('customers');
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [cashAmountsVisible, setCashAmountsVisible] = useState(true);
  const [entryType, setEntryType] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const activitiesPerPage = 5;

  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const [filterMode, setFilterMode] = useState<FilterMode>('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(new Date().getFullYear());
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const [dateRangeFrom, setDateRangeFrom] = useState<Date | undefined>(undefined);
  const [dateRangeTo, setDateRangeTo] = useState<Date | undefined>(undefined);
  const [dateRangePickerOpen, setDateRangePickerOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(undefined);
  const [tempTo, setTempTo] = useState<Date | undefined>(undefined);
  const dateRangePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setMonthPickerOpen(false);
      }
      if (dateRangePickerRef.current && !dateRangePickerRef.current.contains(e.target as Node)) {
        setDateRangePickerOpen(false);
      }
    };
    if (monthPickerOpen || dateRangePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [monthPickerOpen, dateRangePickerOpen]);

  const [billPreviewUrl, setBillPreviewUrl] = useState('');
  const [billUploadedUrl, setBillUploadedUrl] = useState('');
  const [billUploadedPublicId, setBillUploadedPublicId] = useState('');
  const [billUploading, setBillUploading] = useState(false);
  const billFileInputRef = useRef<HTMLInputElement>(null);

  const resetBillState = () => {
    setBillPreviewUrl('');
    setBillUploadedUrl('');
    setBillUploadedPublicId('');
    setBillUploading(false);
    if (billFileInputRef.current) billFileInputRef.current.value = '';
  };

  const handleBillFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Upload JPG, PNG, WEBP, HEIC/HEIF, or PDF.');
      e.target.value = '';
      return;
    }

    setBillUploading(true);
    try {
      let fileToUpload = file;

      if (file.size > MAX_BILL_SIZE_BYTES && isCompressibleImage(file)) {
        toast.loading('Compressing image...', { id: 'compress' });
        const result = await compressImage(file, MAX_BILL_SIZE_BYTES);
        toast.dismiss('compress');
        if (result.wasCompressed) {
          fileToUpload = result.file;
          toast.success(`Compressed: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.compressedSize)}`);
        }
      } else if (file.size > MAX_BILL_SIZE_BYTES) {
        toast.error('File must be under 5MB.');
        e.target.value = '';
        setBillUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetch('/api/uploads/bill', { method: 'POST', body: formData });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await response.json();
      setBillUploadedUrl(data.url);
      setBillUploadedPublicId(data.publicId);
      setBillPreviewUrl(data.url);
      toast.success('Bill uploaded');
    } catch (error) {
      console.error('Bill upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload bill');
    } finally {
      setBillUploading(false);
      if (billFileInputRef.current) billFileInputRef.current.value = '';
    }
  };

  const isViewingCurrentMonth = filterMode === 'month' && selectedMonth === format(new Date(), 'yyyy-MM');
  const isDateRangeActive = filterMode === 'dateRange' && dateRangeFrom && dateRangeTo;

  const dateRangeKey = isDateRangeActive
    ? `${format(dateRangeFrom!, 'yyyy-MM-dd')}_${format(dateRangeTo!, 'yyyy-MM-dd')}`
    : null;

  const dashboardQueryKey = filterMode === 'dateRange'
    ? ['dashboard', { dateRange: dateRangeKey }] as const
    : ['dashboard', { month: isViewingCurrentMonth ? null : selectedMonth }] as const;
  const currentDashboardQueryKey = ['dashboard', { month: null }] as const;

  const buildStatsUrl = () => {
    const base = '/api/dashboard/stats';
    if (filterMode === 'dateRange' && dateRangeFrom && dateRangeTo) {
      const from = format(dateRangeFrom, 'yyyy-MM-dd');
      const to = format(dateRangeTo, 'yyyy-MM-dd');
      return `${base}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    if (filterMode === 'month' && !isViewingCurrentMonth && selectedMonth) {
      return `${base}?month=${encodeURIComponent(selectedMonth)}`;
    }
    return base;
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: async () => {
      const url = buildStatsUrl();
      const response = await fetch(url, { cache: 'no-store' });
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch dashboard data');
      }
      return response.json() as Promise<DashboardResponse>;
    },
    staleTime: 2 * 60 * 1000,
    enabled: filterMode === 'month' || (filterMode === 'dateRange' && !!dateRangeFrom && !!dateRangeTo),
  });

  const currentDashboardData = queryClient.getQueryData<DashboardResponse>(currentDashboardQueryKey);
  const stats = data?.stats || defaultStats;
  const loading = isLoading && !data && isViewingCurrentMonth;
  const periodSectionLoading = (isLoading || isFetching) && !data && (!isViewingCurrentMonth || isDateRangeActive);
  const todayCash = periodSectionLoading && currentDashboardData?.stats?.todayCash
    ? currentDashboardData.stats.todayCash
    : stats.todayCash;
  const renderPrivateCashValue = (value: number) => (
    <>
      <span
        aria-hidden={!cashAmountsVisible}
        className={`inline-block transform-gpu transition-all duration-300 ease-out ${
          cashAmountsVisible
            ? 'scale-100 blur-0 opacity-100'
            : 'scale-[0.99] select-none blur-md opacity-70'
        }`}
      >
        {formatCurrency(value)}
      </span>
      {!cashAmountsVisible && <span className="sr-only">Cash amount blurred for privacy</span>}
    </>
  );
  const recentActivities = (periodSectionLoading ? currentDashboardData?.activities : data?.activities) ?? [];
  const dashboardNotes = (periodSectionLoading ? currentDashboardData?.dashboardNotes : data?.dashboardNotes) ?? [];
  const topCustomers = (periodSectionLoading ? currentDashboardData?.topCustomers : data?.topCustomers) ?? [];
  const topSuppliers = (periodSectionLoading ? currentDashboardData?.topSuppliers : data?.topSuppliers) ?? [];
  const periodLabel = data?.periodLabel;
  const displayStats = periodSectionLoading && currentDashboardData?.stats ? currentDashboardData.stats : stats;

  const addTransactionMutation = useMutation({
    mutationFn: async ({ amountNum, type, desc, billUrl, billPublicId }: { amountNum: number; type: 'in' | 'out'; desc: string; billUrl?: string; billPublicId?: string }) => {
      const dateString = format(new Date(), 'dd-MM-yyyy');
      const response = await fetch('/api/daily-cash-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, type, description: desc, date: dateString, billUrl, billPublicId }),
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
      await queryClient.cancelQueries({ queryKey: ['dashboard'] });
      const previousData = queryClient.getQueryData<DashboardResponse>(currentDashboardQueryKey);
      if (previousData) {
        queryClient.setQueryData<DashboardResponse>(currentDashboardQueryKey, {
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
      if (context?.previousData) {
        queryClient.setQueryData(currentDashboardQueryKey, context.previousData);
      }
      toast.error(err instanceof Error ? err.message : 'Failed to add transaction');
    },
    onSuccess: (_data, variables) => {
      toast.success(`Money ${variables.type === 'in' ? 'added' : 'deducted'} successfully`);
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
    resetBillState();
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

    const currentType = entryType;
    const currentDesc = description;
    const currentBillUrl = billUploadedUrl || undefined;
    const currentBillPublicId = billUploadedPublicId || undefined;
    resetAddTransactionForm();
    setAddTransactionOpen(false);

    addTransactionMutation.mutate({ amountNum, type: currentType, desc: currentDesc, billUrl: currentBillUrl, billPublicId: currentBillPublicId });
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
        className="max-w-7xl mx-auto px-3 sm:px-4 lg:mx-0 lg:ml-0 lg:pl-6 lg:pr-6 xl:pl-8 xl:pr-8 py-1.5 sm:py-5 lg:py-8 space-y-3 sm:space-y-4 lg:space-y-6 w-full min-w-0"
      >
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
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
          <div className="flex items-center gap-2 sm:gap-2 lg:gap-3 flex-1 sm:flex-initial justify-end sm:justify-start order-last sm:order-0 w-full sm:w-auto">
            <div className="w-full sm:w-56 lg:w-72">
              <GlobalSearch />
            </div>
          </div>
          <div className="hidden sm:flex flex-nowrap gap-2 lg:gap-3 shrink-0">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-gray-300 hover:bg-gray-100 text-xs lg:text-sm h-8 lg:h-9 px-3"
            >
              <Link href="/notes" className="whitespace-nowrap">
                Manage Notes
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs lg:text-sm h-8 lg:h-9 px-3"
            >
              <Link href="/transactions/new" className="whitespace-nowrap">
                Record Transaction
              </Link>
            </Button>
          </div>
        </motion.div>

        <div className="flex sm:hidden gap-2 w-full">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-gray-300 hover:bg-gray-100 text-[11px] h-9 px-3 flex-1"
          >
            <Link href="/notes" className="w-full text-center whitespace-nowrap">
              Notes
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] h-9 px-3 flex-1"
          >
            <Link href="/transactions/new" className="w-full text-center whitespace-nowrap">
              New Transaction
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-3 min-w-0">
          <motion.div variants={itemVariants} className="lg:col-span-2 min-w-0">
            <Card className="p-2 sm:p-4 md:p-6 lg:p-8 h-full overflow-hidden" hover={false}>
              <div className="flex flex-col h-full justify-between min-w-0">
                <Dialog
                  open={addTransactionOpen}
                  onOpenChange={(open) => {
                    setAddTransactionOpen(open);
                    if (!open) {
                      resetAddTransactionForm();
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3 min-w-0">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-[10px] sm:text-xs lg:text-sm font-medium text-slate-700 uppercase tracking-wider mb-1 sm:mb-2 lg:mb-3 truncate">
                        Today&apos;s Cash Position
                      </p>
                      <p
                        className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 tracking-tight wrap-break-word overflow-hidden"
                        title={cashAmountsVisible ? formatCurrency(todayCash.totalLeft) : 'Cash amount blurred for privacy'}
                      >
                        {renderPrivateCashValue(todayCash.totalLeft)}
                      </p>
                      <p className="text-[10px] sm:text-xs lg:text-sm text-gray-500 mt-0.5 sm:mt-1 lg:mt-2 max-w-xl">
                        {cashAmountsVisible
                          ? `Final balance as of ${format(new Date(), 'h:mm a')}`
                          : 'Amounts are blurred on the dashboard for privacy'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={cashAmountsVisible}
                        aria-label={cashAmountsVisible ? 'Hide cash amounts' : 'Show cash amounts'}
                        onClick={() => setCashAmountsVisible((visible) => !visible)}
                        className="h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        <span className="relative inline-flex h-4 w-4 items-center justify-center overflow-hidden">
                          <Eye
                            className={`absolute h-4 w-4 transition-all duration-300 ease-out ${
                              cashAmountsVisible
                                ? 'rotate-0 scale-100 opacity-100'
                                : '-rotate-45 scale-75 opacity-0'
                            }`}
                          />
                          <EyeOff
                            className={`absolute h-4 w-4 transition-all duration-300 ease-out ${
                              cashAmountsVisible
                                ? 'rotate-45 scale-75 opacity-0'
                                : 'rotate-0 scale-100 opacity-100'
                            }`}
                          />
                        </span>
                        <span className="hidden sm:inline">
                          {cashAmountsVisible ? 'Hide amounts' : 'Show amounts'}
                        </span>
                        <span className="sm:hidden">
                          {cashAmountsVisible ? 'Hide' : 'Show'}
                        </span>
                      </Button>
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

                      <div>
                        <Label>Bill (optional)</Label>
                        <input
                          ref={billFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                          className="hidden"
                          onChange={handleBillFileSelect}
                        />
                        {billPreviewUrl ? (
                          <div className="mt-2 relative inline-block">
                            {billPreviewUrl.toLowerCase().includes('.pdf') ? (
                              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                                <FileText className="h-5 w-5 text-red-500" />
                                <span className="text-sm text-gray-700">PDF attached</span>
                              </div>
                            ) : (
                              <Image src={billPreviewUrl} alt="Bill preview" width={200} height={150} unoptimized className="rounded-lg border object-cover max-h-36" />
                            )}
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                              onClick={() => { resetBillState(); }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-2 w-full"
                            onClick={() => billFileInputRef.current?.click()}
                            disabled={billUploading}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {billUploading ? 'Uploading...' : 'Attach Bill'}
                          </Button>
                        )}
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
                        disabled={addTransactionMutation.isPending || billUploading}
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
                      {renderPrivateCashValue(todayCash.totalIn)}
                    </p>
                  </div>
                  <div className="rounded-lg sm:rounded-xl lg:rounded-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-3 lg:py-4 flex-1 min-w-0 sm:min-w-[140px] lg:min-w-[160px] bg-red-100">
                    <div className="flex items-center gap-1 sm:gap-2 text-red-700 mb-0.5 sm:mb-1">
                      <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 shrink-0" />
                      <span className="text-[9px] sm:text-[10px] lg:text-xs font-semibold uppercase tracking-wide">Cash Out</span>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-red-700 wrap-break-word leading-tight">
                      {renderPrivateCashValue(todayCash.totalOut)}
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

        <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 min-w-0">
          <StatCard
            label="Total Customers"
            value={displayStats.totalCustomers.toString()}
            icon={<Users className="w-5 h-5" />}
            iconBg="bg-blue-100 text-blue-700"
            delay={0}
          />
          <StatCard
            label="Total Suppliers"
            value={displayStats.totalSuppliers.toString()}
            icon={<Truck className="w-5 h-5" />}
            iconBg="bg-purple-100 text-purple-700"
            delay={1}
          />
          <StatCard
            label="Total Credit"
            value={formatCurrency(displayStats.totalCredit)}
            icon={<TrendingUp className="w-5 h-5" />}
            iconBg="bg-green-100 text-green-700"
            delay={2}
          />
          <StatCard
            label="Total Debit"
            value={formatCurrency(displayStats.totalDebit)}
            icon={<TrendingDown className="w-5 h-5" />}
            iconBg="bg-red-100 text-red-700"
            delay={3}
          />
        </div>

        <motion.div variants={itemVariants}>
          <Card className="p-3 sm:p-4 lg:p-5 overflow-hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-lg bg-slate-900 p-2 text-white shrink-0">
                  <Boxes className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">Inventory Snapshot</p>
                  <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 truncate">Stock overview</h3>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="border-gray-300 hover:bg-gray-100 self-start sm:self-auto">
                <Link href="/inventory">Open Inventory</Link>
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 min-w-0">
                <div className="flex items-center gap-2 text-blue-700">
                  <PackageCheck className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate">Items</span>
                </div>
                <p className="mt-2 text-lg sm:text-xl font-bold text-gray-900 truncate">{(displayStats.inventory?.totalItems || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">{(displayStats.inventory?.totalQuantity || 0).toLocaleString('en-IN')} units</p>
              </div>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 min-w-0">
                <div className="flex items-center gap-2 text-emerald-700">
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate">Value</span>
                </div>
                <p className="mt-2 text-lg sm:text-xl font-bold text-gray-900 truncate" title={formatCurrency(displayStats.inventory?.totalValue || 0)}>
                  {formatCurrency(displayStats.inventory?.totalValue || 0)}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">Buying price based</p>
              </div>

              <div className="rounded-lg border border-red-100 bg-red-50 p-3 min-w-0">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate">Out</span>
                </div>
                <p className="mt-2 text-lg sm:text-xl font-bold text-gray-900 truncate">{(displayStats.inventory?.outOfStockItems || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">zero quantity</p>
              </div>

              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 min-w-0">
                <div className="flex items-center gap-2 text-amber-700">
                  <ClipboardList className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate">Restock</span>
                </div>
                <p className="mt-2 text-lg sm:text-xl font-bold text-gray-900 truncate">{(displayStats.inventory?.restockItems || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">1-{displayStats.inventory?.lowStockThreshold || 5} quantity</p>
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="grid gap-3 sm:gap-4 lg:gap-6 lg:grid-cols-5 lg:items-stretch lg:grid-rows-[auto] min-w-0 overflow-hidden">
          <motion.div variants={itemVariants} className="lg:col-span-3 flex flex-col min-h-[320px] sm:min-h-[360px] min-w-0">
            <Card className="p-3 sm:p-4 lg:p-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Filter Mode Toggle + Filters */}
              <div className="flex flex-col gap-3 sm:gap-4 mb-3 sm:mb-4 lg:mb-6 shrink-0 min-w-0">
                {/* Row 1: Title + Filter Mode Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">
                      {periodLabel ? 'Sales trend' : '30-Day Trend'}
                    </p>
                    <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate" title={periodLabel ? `Cash Flow Overview – ${periodLabel}` : 'Cash Flow Overview'}>
                      Cash Flow Overview{periodLabel ? ` – ${periodLabel}` : ''}
                    </h3>
                  </div>
                  <div className="flex rounded-lg bg-gray-100 p-0.5 border border-gray-200 shrink-0 self-start sm:self-auto relative" ref={monthPickerRef}>
                    <button
                      onClick={() => {
                        if (filterMode === 'month') {
                          setMonthPickerOpen((o) => !o);
                        } else {
                          setFilterMode('month');
                        }
                      }}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                        filterMode === 'month'
                          ? 'bg-white shadow-sm text-slate-900'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      aria-expanded={filterMode === 'month' && monthPickerOpen}
                      title="Select month"
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span className="truncate">{format(new Date(selectedMonth + '-01'), 'MMM yyyy')}</span>
                      {filterMode === 'month' && <span className="text-gray-400 shrink-0 ml-0.5 text-[10px]">▼</span>}
                    </button>
                    <div className="relative" ref={dateRangePickerRef}>
                      <button
                        onClick={() => {
                          setTempFrom(dateRangeFrom);
                          setTempTo(dateRangeTo);
                          setDateRangePickerOpen((o) => !o);
                          setMonthPickerOpen(false);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                          filterMode === 'dateRange'
                            ? 'bg-white shadow-sm text-slate-900'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <CalendarRange className="w-3.5 h-3.5" />
                        {filterMode === 'dateRange' && dateRangeFrom && dateRangeTo
                          ? `${format(dateRangeFrom, 'dd MMM')} – ${format(dateRangeTo, 'dd MMM')}`
                          : 'Date Range'
                        }
                        <span className="text-gray-400 shrink-0 ml-0.5 text-[10px]">▼</span>
                      </button>
                      {dateRangePickerOpen && (
                        <div className="fixed inset-x-0 top-1/3 mx-auto sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:mx-0 mt-0 sm:mt-2 z-50 bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-[260px]">
                          <p className="text-xs font-semibold text-slate-800 mb-3">Select Date Range</p>
                          <div className="space-y-3">
                            <div>
                              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">From</label>
                              <input
                                type="date"
                                value={tempFrom ? format(tempFrom, 'yyyy-MM-dd') : ''}
                                max={format(new Date(), 'yyyy-MM-dd')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) {
                                    const d = new Date(val + 'T00:00:00');
                                    setTempFrom(d);
                                    if (tempTo && d > tempTo) setTempTo(undefined);
                                  } else {
                                    setTempFrom(undefined);
                                  }
                                }}
                                className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1 block">To</label>
                              <input
                                type="date"
                                value={tempTo ? format(tempTo, 'yyyy-MM-dd') : ''}
                                min={tempFrom ? format(tempFrom, 'yyyy-MM-dd') : undefined}
                                max={format(new Date(), 'yyyy-MM-dd')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) {
                                    setTempTo(new Date(val + 'T00:00:00'));
                                  } else {
                                    setTempTo(undefined);
                                  }
                                }}
                                className="w-full h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                            {filterMode === 'dateRange' && (dateRangeFrom || dateRangeTo) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDateRangeFrom(undefined);
                                  setDateRangeTo(undefined);
                                  setTempFrom(undefined);
                                  setTempTo(undefined);
                                  setFilterMode('month');
                                  setDateRangePickerOpen(false);
                                }}
                                className="text-[11px] text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            ) : <span />}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setDateRangePickerOpen(false)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!tempFrom || !tempTo}
                                onClick={() => {
                                  if (tempFrom && tempTo) {
                                    setDateRangeFrom(tempFrom);
                                    setDateRangeTo(tempTo);
                                    setFilterMode('dateRange');
                                    setDateRangePickerOpen(false);
                                  }
                                }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                  tempFrom && tempTo
                                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {monthPickerOpen && filterMode === 'month' && (
                      <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl border border-gray-200 shadow-lg p-3 w-[220px]">
                        {/* Year navigation */}
                        <div className="flex items-center justify-between mb-3">
                          <button
                            type="button"
                            onClick={() => setMonthPickerYear((y) => y - 1)}
                            className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
                            aria-label="Previous year"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm font-semibold text-slate-800">{monthPickerYear}</span>
                          <button
                            type="button"
                            onClick={() => setMonthPickerYear((y) => y + 1)}
                            className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
                            aria-label="Next year"
                            disabled={monthPickerYear >= new Date().getFullYear()}
                          >
                            <ChevronRight className={`w-4 h-4 ${monthPickerYear >= new Date().getFullYear() ? 'opacity-30' : ''}`} />
                          </button>
                        </div>
                        {/* Month grid */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((monthName, idx) => {
                            const monthKey = `${monthPickerYear}-${String(idx + 1).padStart(2, '0')}`;
                            const isSelected = selectedMonth === monthKey;
                            const isFuture = monthPickerYear > new Date().getFullYear() || (monthPickerYear === new Date().getFullYear() && idx > new Date().getMonth());
                            const isCurrent = monthPickerYear === new Date().getFullYear() && idx === new Date().getMonth();
                            return (
                              <button
                                key={monthKey}
                                type="button"
                                disabled={isFuture}
                                onClick={() => {
                                  setSelectedMonth(monthKey);
                                  setMonthPickerOpen(false);
                                }}
                                className={`px-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                                    : isFuture
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : isCurrent
                                    ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
                                    : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {monthName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Legend */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">

                  {/* Legend */}
                  <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                    <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs shrink-0">
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-700" />
                      <span className="text-gray-600 whitespace-nowrap">Cash In</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs shrink-0">
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-700" />
                      <span className="text-gray-600 whitespace-nowrap">Cash Out</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-48 sm:h-60 lg:h-72 w-full overflow-hidden shrink-0 min-h-0">
                {periodSectionLoading ? (
                  <div className="h-full w-full flex flex-col justify-center gap-2 p-4">
                    <Skeleton className="h-full w-full rounded-lg" />
                    <p className="text-center text-xs text-gray-500">Loading period data…</p>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-gray-400">
                    <BarChart3 className="w-12 h-12 mb-3 opacity-50" strokeWidth={1} />
                    <p className="text-sm">No sales data for this period</p>
                  </div>
                ) : (
                  <SalesChart data={chartData} />
                )}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="lg:col-span-2 flex flex-col min-h-[320px] sm:min-h-[360px] min-w-0">
            <Card className="p-3 sm:p-4 lg:p-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4 lg:mb-6 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider truncate">
                    {periodLabel ? 'Period Summary' : 'This Month'}
                  </p>
                  <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mt-0.5 sm:mt-1 truncate" title={periodLabel ? `Cash Summary – ${periodLabel}` : 'Cash Summary'}>
                    Cash Summary{periodLabel ? ` – ${periodLabel}` : ''}
                  </h3>
                </div>
                {!periodSectionLoading && (
                  <span className="px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 rounded-full bg-green-100 text-green-700 text-[9px] sm:text-[10px] lg:text-xs font-semibold shrink-0 overflow-hidden max-w-[100px] sm:max-w-none" title={formatCurrency(stats.monthlyTotals.totalLeft) + ' net'}>
                    <span className="block truncate">{formatCurrency(stats.monthlyTotals.totalLeft)} net</span>
                  </span>
                )}
              </div>

              {periodSectionLoading ? (
                <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                  <Skeleton className="h-16 sm:h-20 w-full rounded-xl" />
                  <Skeleton className="h-16 sm:h-20 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-lg mt-2" />
                  <p className="text-center text-xs text-gray-500">Loading period data…</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3 lg:space-y-4 min-w-0">
                  <div className="flex items-center justify-between gap-2 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl bg-green-50 border border-green-200 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-green-100 text-green-700 shrink-0">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate">Total Cash In</p>
                        <p className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 truncate" title={formatCurrency(stats.monthlyTotals.totalIn)}>{formatCurrency(stats.monthlyTotals.totalIn)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl bg-red-50 border border-red-200 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="p-1.5 sm:p-2 rounded-lg bg-red-100 text-red-700 shrink-0">
                        <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate">Total Cash Out</p>
                        <p className="text-sm sm:text-base lg:text-lg font-bold text-gray-900 truncate" title={formatCurrency(stats.monthlyTotals.totalOut)}>{formatCurrency(stats.monthlyTotals.totalOut)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 sm:pt-3 lg:pt-4 border-t border-gray-200/50 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm text-gray-500 shrink-0">Net Balance</span>
                      <span className={`text-lg sm:text-xl lg:text-2xl font-bold truncate min-w-0 text-right ${stats.monthlyTotals.totalLeft >= 0 ? 'text-green-700' : 'text-red-700'}`} title={formatCurrency(stats.monthlyTotals.totalLeft)}>
                        {formatCurrency(stats.monthlyTotals.totalLeft)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
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

            <div className="grid gap-2 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(activeEntityTab === 'customers' ? topCustomers : topSuppliers).length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-400">
                  <p className="text-sm">No {activeEntityTab} data available yet.</p>
                </div>
              ) : (
                (activeEntityTab === 'customers' ? topCustomers : topSuppliers).map((entity) => (
                  <div key={entity.id} className="min-w-0 self-start">
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
