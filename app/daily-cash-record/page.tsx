'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { format, parse } from 'date-fns';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Pagination } from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Edit2, CalendarIcon, Plus, Upload, FileText, X } from 'lucide-react';
import Image from 'next/image';
import { compressImage, isCompressibleImage, formatFileSize } from '@/lib/imageCompression';
import { motion } from 'motion/react'

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_BILL_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
];

interface CashEntry {
  id: string;
  amount: number;
  type: 'in' | 'out';
  description: string;
  billUrl?: string;
  billPublicId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DailyRecord {
  id: string;
  date: string;
  entries: CashEntry[];
  totalIn: number;
  totalOut: number;
  totalLeft: number;
}

interface SummaryRecord {
  id: string;
  date: string;
  totalIn: number;
  totalOut: number;
  totalLeft: number;
  entryCount: number;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  recordsPerPage: number;
}

export default function DailyCashRecordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentRecord, setCurrentRecord] = useState<DailyRecord | null>(null);
  const [summaryRecords, setSummaryRecords] = useState<SummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [seePrevRecordsOpen, setSeePrevRecordsOpen] = useState(false);
  const [createNewRecordOpen, setCreateNewRecordOpen] = useState(false);
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [viewRecordOpen, setViewRecordOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashEntry | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DailyRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [recordsCache, setRecordsCache] = useState<Map<string, DailyRecord>>(new Map());
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const hasFetchedRef = useRef(false);
  const prevPageRef = useRef<number | null>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [entryType, setEntryType] = useState<'in' | 'out'>('in');
  const [recordDate, setRecordDate] = useState<Date>(new Date());
  const [showCreateCalendar, setShowCreateCalendar] = useState(false);
  const [showAddTransactionCalendar, setShowAddTransactionCalendar] = useState(false);
  const [showEditCalendar, setShowEditCalendar] = useState(false);

  // Bill upload state
  const [billPreviewUrl, setBillPreviewUrl] = useState<string>('');
  const [billUploadedUrl, setBillUploadedUrl] = useState<string>('');
  const [billUploadedPublicId, setBillUploadedPublicId] = useState<string>('');
  const [billUploading, setBillUploading] = useState(false);
  const billFileInputRef = useRef<HTMLInputElement>(null);

  // Bill view modal state
  const [billViewOpen, setBillViewOpen] = useState(false);
  const [billViewUrl, setBillViewUrl] = useState<string>('');

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

  const fetchData = async (page: number = 1) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/daily-cash-records?page=${page}`);
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setSummaryRecords(data.records || []);
      setPagination(data.pagination || null);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching summary:', error);
      toast.error('Failed to load records');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      prevPageRef.current = currentPage;
      fetchData(1);
    } else if (prevPageRef.current !== currentPage) {
      prevPageRef.current = currentPage;
      fetchData(currentPage);
    }
  }, [currentPage]);



  const fetchRecordForDate = async (date: Date, useCache: boolean = true) => {
    const dateString = format(date, 'dd-MM-yyyy');

    if (useCache && recordsCache.has(dateString)) {
      return recordsCache.get(dateString)!;
    }

    try {
      const response = await fetch(`/api/daily-cash-records?date=${dateString}`);
      if (response.status === 401) {
        router.push('/login');
        return null;
      }
      const data = await response.json();
      const record = data.record;

      if (record) {
        setRecordsCache((prev) => {
          const newCache = new Map(prev);
          newCache.set(dateString, record);
          return newCache;
        });
      }

      return record;
    } catch (error) {
      console.error('Error fetching record:', error);
      toast.error('Failed to load record');
      return null;
    }
  };

  const handleCreateRecordForToday = () => {
    setRecordDate(new Date());
    resetBillState();
    setCreateNewRecordOpen(true);
  };

  const handleCreateRecord = async () => {
    if (!amount || !description) {
      toast.error('Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const dateString = format(recordDate, 'dd-MM-yyyy');
      const response = await fetch('/api/daily-cash-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountNum,
          type: entryType,
          description,
          date: dateString,
          billUrl: billUploadedUrl || undefined,
          billPublicId: billUploadedPublicId || undefined,
        }),
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const data = await response.json();
      if (response.ok) {
        toast.success(`Money ${entryType === 'in' ? 'added' : 'deducted'} successfully`);
        setAmount('');
        setDescription('');
        setRecordDate(new Date());
        setEntryType('in');
        resetBillState();
        setCreateNewRecordOpen(false);

        if (data.record) {
          setRecordsCache((prev) => {
            const newCache = new Map(prev);
            newCache.set(dateString, data.record);
            return newCache;
          });
        }

        queryClient.invalidateQueries({ queryKey: ['dashboard'] });

        setCurrentPage(1);
        fetchData(1);
      } else {
        toast.error(data.error || 'Failed to add entry');
      }
    } catch (error) {
      console.error('Error adding entry:', error);
      toast.error('Failed to add entry');
    }
  };

  const handleViewRecord = async (record: SummaryRecord) => {
    const parsedDate = parse(record.date, 'dd-MM-yyyy', new Date());
    const recordData = await fetchRecordForDate(parsedDate, true);
    if (recordData) {
      setViewingRecord(recordData);
      setViewRecordOpen(true);
    }
  };

  const handleEditEntry = (entry: CashEntry, record: DailyRecord) => {
    setEditingEntry(entry);
    setAmount(entry.amount.toString());
    setDescription(entry.description);
    setRecordDate(parse(record.date, 'dd-MM-yyyy', new Date()));
    setEntryType(entry.type);
    // Pre-fill bill state from existing entry
    setBillUploadedUrl(entry.billUrl || '');
    setBillUploadedPublicId(entry.billPublicId || '');
    setBillPreviewUrl(entry.billUrl || '');
    setEditEntryOpen(true);
  };

  const handleAddTransaction = async () => {
    if (!amount || !description || !viewingRecord) {
      toast.error('Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const dateString = format(recordDate, 'dd-MM-yyyy');
      const response = await fetch('/api/daily-cash-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountNum,
          type: entryType,
          description,
          date: dateString,
          billUrl: billUploadedUrl || undefined,
          billPublicId: billUploadedPublicId || undefined,
        }),
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const data = await response.json();
      if (response.ok) {
        toast.success(`Transaction ${entryType === 'in' ? 'added' : 'deducted'} successfully`);
        setAmount('');
        setDescription('');
        setEntryType('in');
        resetBillState();
        setAddTransactionOpen(false);

        if (data.record) {
          setRecordsCache((prev) => {
            const newCache = new Map(prev);
            newCache.set(dateString, data.record);
            return newCache;
          });
          setViewingRecord(data.record);
        }

        queryClient.invalidateQueries({ queryKey: ['dashboard'] });

        fetchData(currentPage);
      } else {
        toast.error(data.error || 'Failed to add transaction');
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      toast.error('Failed to add transaction');
    }
  };

  const handleUpdateEntry = async () => {
    if (!amount || !description || !editingEntry) {
      toast.error('Please fill in all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const dateString = format(recordDate, 'dd-MM-yyyy');
      const response = await fetch(`/api/daily-cash-records/${editingEntry.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountNum,
          type: entryType,
          description,
          date: dateString,
          billUrl: billUploadedUrl || null,
          billPublicId: billUploadedPublicId || null,
        }),
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const data = await response.json();
      if (response.ok) {
        toast.success('Entry updated successfully');
        setAmount('');
        setDescription('');
        resetBillState();
        setEditingEntry(null);
        setEditEntryOpen(false);

        setRecordsCache((prev) => {
          const newCache = new Map(prev);
          newCache.delete(dateString);
          return newCache;
        });

        queryClient.invalidateQueries({ queryKey: ['dashboard'] });

        if (viewingRecord) {
          const updatedRecord = await fetchRecordForDate(recordDate, false);
          if (updatedRecord) {
            setViewingRecord(updatedRecord);
          }
        }
        fetchData();
      } else {
        toast.error(data.error || 'Failed to update entry');
      }
    } catch (error) {
      console.error('Error updating entry:', error);
      toast.error('Failed to update entry');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-3 py-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-8 w-48 sm:h-10 sm:w-64 mb-4 sm:mb-6" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 mb-4">
            <Skeleton className="h-10 sm:h-9" />
            <Skeleton className="h-10 sm:h-9" />
          </div>
          <div className="grid grid-cols-1 max-sm:gap-0 gap-3 md:grid-cols-2 xl:grid-cols-3 md:gap-4">
            <Skeleton className="h-[132px] rounded-none max-sm:border-b max-sm:border-slate-200/80 md:h-28 md:rounded-xl" />
            <Skeleton className="h-[132px] rounded-none max-sm:border-b max-sm:border-slate-200/80 md:h-28 md:rounded-xl" />
            <Skeleton className="h-[132px] rounded-none max-sm:border-b-0 max-sm:border-slate-200/80 md:h-28 md:rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-3 pb-10 sm:p-6 sm:pb-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-3 sm:mb-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Daily cash record
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            <span className="sm:hidden">Tap a day to view entries and add transactions</span>
            <span className="hidden sm:inline">Select a day to view entries and add transactions</span>
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3 mb-4 sm:mb-6">
          <Dialog open={createNewRecordOpen} onOpenChange={(open) => {
            setCreateNewRecordOpen(open);
            if (!open) { setShowCreateCalendar(false); resetBillState(); }
          }}>
            <DialogTrigger asChild>
              <Button
                onClick={handleCreateRecordForToday}
                variant="default"
                className="h-10 w-full rounded-lg bg-slate-900 text-white hover:bg-slate-800 sm:h-9 sm:w-auto sm:shrink-0 text-xs sm:text-sm px-2 sm:px-4"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2 shrink-0" />
                <span className="truncate">New for today</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Record</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="record-date">Date *</Label>
                  <div className="mt-2 relative">
                    <Input
                      id="record-date"
                      type="text"
                      readOnly
                      value={format(recordDate, 'dd-MM-yyyy')}
                      className="pr-10 cursor-pointer"
                      onClick={() => setShowCreateCalendar(!showCreateCalendar)}
                    />
                    <CalendarIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    {showCreateCalendar && (
                      <div className="mt-2 bg-white border rounded-md shadow-lg">
                        <Calendar
                          mode="single"
                          selected={recordDate}
                          onSelect={(date) => {
                            if (date) {
                              setRecordDate(date);
                              setShowCreateCalendar(false);
                            }
                          }}
                          className="rounded-md border"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="entry-type">Type *</Label>
                  <Select value={entryType} onValueChange={(value: 'in' | 'out') => setEntryType(value)}>
                    <SelectTrigger id="entry-type" className="w-full mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Money In</SelectItem>
                      <SelectItem value="out">Money Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Input
                    id="description"
                    placeholder="Enter description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-2"
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
                <Button
                  onClick={handleCreateRecord}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={billUploading}
                >
                  Create Record
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={seePrevRecordsOpen} onOpenChange={setSeePrevRecordsOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-10 w-full rounded-lg border-slate-200 bg-white sm:h-9 sm:w-auto sm:shrink-0 text-xs sm:text-sm px-2 sm:px-4"
              >
                <CalendarIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2 shrink-0" />
                <span className="truncate">Open by date</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Select Date</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      fetchRecordForDate(date, true).then((record) => {
                        if (record) {
                          setViewingRecord(record);
                          setSeePrevRecordsOpen(false);
                          setViewRecordOpen(true);
                        } else {
                          toast.error('No record found for this date');
                        }
                      });
                    }
                  }}
                  className="rounded-md border"
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Separator className="mb-4 sm:mb-6 bg-slate-200/80" />

        {/* Records list — edge-to-edge on mobile; same flat layout on desktop (no outer frame) */}
        <section className="mt-0 -mx-3 sm:mx-0 sm:mt-2">
            {summaryRecords.length > 0 ? (
              <>
                <div className="grid grid-cols-1 max-sm:gap-0 gap-3 sm:mb-6 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
                  {summaryRecords.map((record, index) => (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                    >
                      <button
                        type="button"
                        onClick={() => handleViewRecord(record)}
                        className={`group w-full text-left bg-white transition-colors max-sm:border-b max-sm:border-slate-200/90 max-sm:rounded-none hover:bg-slate-50/90 active:bg-slate-50 sm:rounded-xl sm:border sm:border-slate-200/90 sm:shadow-sm sm:hover:border-slate-300 sm:hover:shadow-md ${
                          index === summaryRecords.length - 1 ? 'max-sm:border-b-0' : ''
                        }`}
                      >
                        <div className="px-3 pt-2.5 pb-2 sm:px-4 sm:pt-4 sm:pb-3 max-sm:px-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400 sm:h-5 sm:w-5" />
                              <span className="truncate text-sm font-semibold tabular-nums text-slate-900 sm:text-base">
                                {record.date}
                              </span>
                            </div>
                            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 sm:text-xs">
                              {record.entryCount} {record.entryCount === 1 ? 'entry' : 'entries'}
                            </span>
                          </div>
                        </div>
                        <div className="mx-3 mb-2.5 overflow-hidden rounded-lg border border-slate-100 max-sm:mx-3.5 sm:mx-4 sm:mb-4">
                          <div className="flex items-center justify-between gap-2 bg-emerald-50/80 px-2.5 py-2 text-sm sm:px-3">
                            <span className="font-medium text-emerald-800">In</span>
                            <span className="font-semibold tabular-nums text-emerald-800">
                              {formatCurrency(record.totalIn)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-2.5 py-2 text-sm sm:px-3">
                            <span className="font-medium text-rose-800">Out</span>
                            <span className="font-semibold tabular-nums text-rose-800">
                              {formatCurrency(record.totalOut)}
                            </span>
                          </div>
                          <div
                            className={`flex items-center justify-between gap-2 border-t-2 px-2.5 py-2.5 text-sm sm:px-3 sm:py-3 ${
                              record.totalLeft >= 0
                                ? 'border-emerald-200 bg-slate-900 text-white'
                                : 'border-rose-300 bg-rose-950 text-white'
                            }`}
                          >
                            <span className="text-xs font-semibold uppercase tracking-wide text-white/90 sm:text-sm sm:normal-case sm:tracking-normal">
                              Balance
                            </span>
                            <span className="text-base font-bold tabular-nums sm:text-lg">
                              {formatCurrency(record.totalLeft)}
                            </span>
                          </div>
                        </div>
                      </button>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end border-t border-slate-200/80 pt-4 max-sm:mt-1 max-sm:bg-slate-50/80 max-sm:px-3 max-sm:py-3 sm:mt-6">
                  {pagination && (
                    <Pagination
                      currentPage={pagination.currentPage}
                      totalPages={pagination.totalPages}
                      onPageChange={handlePageChange}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 px-4 text-slate-500 sm:py-16">
                <CalendarIcon className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-medium text-slate-700">No daily records yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Use <span className="font-medium text-slate-600">New for today</span> to add your first entry.
                </p>
              </div>
            )}
        </section>

        {/* View Record Dialog */}
        <Dialog open={viewRecordOpen} onOpenChange={setViewRecordOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-5xl max-h-[92vh] flex flex-col p-0 rounded-2xl border-0 shadow-2xl overflow-hidden">
            {/* Clean Header */}
            <DialogHeader className="px-5 sm:px-6 pt-5 pb-4 pr-12 flex-shrink-0 bg-white border-b border-gray-100">
              <div className="flex flex-col gap-4">
                <DialogTitle className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {viewingRecord?.date || format(selectedDate, 'dd-MM-yyyy')}
                </DialogTitle>
                
                {viewingRecord && (
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Stats Pills */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">In:</span>
                      <span className="text-lg font-bold text-green-600">{formatCurrency(viewingRecord.totalIn)}</span>
                    </div>
                    <div className="w-px h-5 bg-gray-200 hidden sm:block"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Out:</span>
                      <span className="text-lg font-bold text-red-600">{formatCurrency(viewingRecord.totalOut)}</span>
                    </div>
                    <div className="w-px h-5 bg-gray-200 hidden sm:block"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Balance:</span>
                      <span className={`text-lg font-bold ${viewingRecord.totalLeft >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(viewingRecord.totalLeft)}
                      </span>
                    </div>
                    
                    {/* Add Button */}
                    <Button
                      onClick={() => {
                        setRecordDate(parse(viewingRecord.date, 'dd-MM-yyyy', new Date()));
                        setAmount('');
                        setDescription('');
                        setEntryType('in');
                        setAddTransactionOpen(true);
                      }}
                      size="sm"
                      className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white ml-auto"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>
            {/* Content Area */}
            <div className="flex-1 overflow-auto bg-white">
              {viewingRecord && viewingRecord.entries && viewingRecord.entries.length > 0 ? (
                <>
                  {/* Mobile Card View */}
                  <div className="block lg:hidden p-4 space-y-3">
                    {viewingRecord.entries.map((entry, idx) => {
                      const entryDate = entry.createdAt
                        ? format(new Date(entry.createdAt), 'dd-MM-yyyy')
                        : viewingRecord.date;
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`rounded-xl p-4 ${
                            entry.type === 'in' 
                              ? 'bg-green-50 border border-green-200' 
                              : 'bg-red-50 border border-red-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-500 mb-1">{entryDate}</p>
                              <p className="font-medium text-gray-900 break-words">{entry.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-lg font-bold ${
                                entry.type === 'in' ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {entry.type === 'out' && '-'}{formatCurrency(entry.amount)}
                              </span>
                              {entry.billUrl && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setBillViewUrl(entry.billUrl!); setBillViewOpen(true); }}
                                  className="h-8 w-8 p-0"
                                >
                                  <FileText className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditEntry(entry, viewingRecord)}
                                className="h-8 w-8 p-0"
                              >
                                <Edit2 className="h-4 w-4 text-gray-400" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Date</th>
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Description</th>
                          <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Money Out</th>
                          <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-4">Money In</th>
                          <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-4">Bill</th>
                          <th className="w-16 px-6 py-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {viewingRecord.entries.map((entry) => {
                          const entryDate = entry.createdAt
                            ? format(new Date(entry.createdAt), 'dd-MM-yyyy')
                            : viewingRecord.date;
                          return (
                            <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{entryDate}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                {entry.type === 'out' ? (
                                  <span className="text-red-600 font-semibold">{formatCurrency(entry.amount)}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                {entry.type === 'in' ? (
                                  <span className="text-green-600 font-semibold">{formatCurrency(entry.amount)}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {entry.billUrl ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setBillViewUrl(entry.billUrl!); setBillViewOpen(true); }}
                                    className="h-8 w-8 p-0"
                                    title="View Bill"
                                  >
                                    <FileText className="h-4 w-4 text-blue-500" />
                                  </Button>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditEntry(entry, viewingRecord)}
                                  className="h-8 w-8 p-0 opacity-50 hover:opacity-100"
                                >
                                  <Edit2 className="h-4 w-4 text-gray-500" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Footer */}
                  <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap gap-6">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Out</p>
                          <p className="text-lg font-bold text-red-600">{formatCurrency(viewingRecord.totalOut)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Total In</p>
                          <p className="text-lg font-bold text-green-600">{formatCurrency(viewingRecord.totalIn)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Balance</p>
                        <p className={`text-2xl font-bold ${viewingRecord.totalLeft >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(viewingRecord.totalLeft)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <CalendarIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-lg font-medium text-gray-900 mb-1">No entries yet</p>
                  <p className="text-sm text-gray-500">Add your first transaction for this date</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Transaction Dialog */}
        <Dialog open={addTransactionOpen} onOpenChange={(open) => {
          setAddTransactionOpen(open);
          if (!open) { setShowAddTransactionCalendar(false); resetBillState(); }
        }}>
          <DialogContent className="max-w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="add-transaction-date">Date *</Label>
                <div className="mt-2 relative">
                  <Input
                    id="add-transaction-date"
                    type="text"
                    readOnly
                    value={format(recordDate, 'dd-MM-yyyy')}
                    className="pr-10 cursor-pointer"
                    onClick={() => setShowAddTransactionCalendar(!showAddTransactionCalendar)}
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  {showAddTransactionCalendar && (
                    <div className="mt-2 bg-white border rounded-md shadow-lg">
                      <Calendar
                        mode="single"
                        selected={recordDate}
                        onSelect={(date) => {
                          if (date) {
                            setRecordDate(date);
                            setShowAddTransactionCalendar(false);
                          }
                        }}
                        className="rounded-md border"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="add-transaction-type">Type *</Label>
                <Select value={entryType} onValueChange={(value: 'in' | 'out') => setEntryType(value)}>
                  <SelectTrigger id="add-transaction-type" className="w-full mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Money In</SelectItem>
                    <SelectItem value="out">Money Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="add-transaction-amount">Amount *</Label>
                <Input
                  id="add-transaction-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="add-transaction-description">Description *</Label>
                <Input
                  id="add-transaction-description"
                  placeholder="Enter description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-2"
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
              <Button
                onClick={handleAddTransaction}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={billUploading}
              >
                Add Transaction
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Entry Dialog */}
        <Dialog open={editEntryOpen} onOpenChange={(open) => {
          setEditEntryOpen(open);
          if (!open) { setShowEditCalendar(false); resetBillState(); }
        }}>
          <DialogContent className="max-w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-date">Date *</Label>
                <div className="mt-2 relative">
                  <Input
                    id="edit-date"
                    type="text"
                    readOnly
                    value={format(recordDate, 'dd-MM-yyyy')}
                    className="pr-10 cursor-pointer"
                    onClick={() => setShowEditCalendar(!showEditCalendar)}
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  {showEditCalendar && (
                    <div className="mt-2 bg-white border rounded-md shadow-lg">
                      <Calendar
                        mode="single"
                        selected={recordDate}
                        onSelect={(date) => {
                          if (date) {
                            setRecordDate(date);
                            setShowEditCalendar(false);
                          }
                        }}
                        className="rounded-md border"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="edit-type">Type *</Label>
                <Select value={entryType} onValueChange={(value: 'in' | 'out') => setEntryType(value)}>
                  <SelectTrigger id="edit-type" className="w-full mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Money In</SelectItem>
                    <SelectItem value="out">Money Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-amount">Amount *</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description *</Label>
                <Input
                  id="edit-description"
                  placeholder="Enter description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-2"
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
              <Button
                onClick={handleUpdateEntry}
                className="w-full"
                disabled={billUploading}
              >
                Update Entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bill View Modal */}
        <Dialog open={billViewOpen} onOpenChange={setBillViewOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Bill Attachment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {billViewUrl ? (
                billViewUrl.toLowerCase().includes('.pdf') ? (
                  <div className="rounded border border-dashed p-4 text-sm text-gray-700 text-center">
                    <FileText className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p>Bill is a PDF document.</p>
                    <a
                      href={billViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm mt-2 inline-block"
                    >
                      Open PDF in new tab
                    </a>
                  </div>
                ) : (
                  <Image
                    src={billViewUrl}
                    alt="Bill"
                    width={800}
                    height={600}
                    unoptimized
                    className="w-full max-h-[60vh] rounded-md object-contain border"
                  />
                )
              ) : (
                <p className="text-sm text-muted-foreground">No bill attached.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
