'use client';

import { useState, useEffect, useRef, ChangeEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, isValid, parse } from 'date-fns';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Edit2, CalendarIcon, Plus, Upload, FileText, X, Download, Loader2 } from 'lucide-react';
import { ASSISTANT_DATA_UPDATED_EVENT } from '@/lib/assistant-events';
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
  const [summaryRecords, setSummaryRecords] = useState<SummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [seePrevRecordsOpen, setSeePrevRecordsOpen] = useState(false);
  const [createNewRecordOpen, setCreateNewRecordOpen] = useState(false);
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [viewRecordOpen, setViewRecordOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CashEntry | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DailyRecord | null>(null);
  const [openingRecordId, setOpeningRecordId] = useState<string | null>(null);
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

  // PDF download state
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfFrom, setPdfFrom] = useState('');
  const [pdfTo, setPdfTo] = useState('');
  const [pdfDownloading, setPdfDownloading] = useState(false);

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

  const fetchData = useCallback(async (page: number = 1) => {
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
  }, [router]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      prevPageRef.current = currentPage;
      fetchData(1);
    } else if (prevPageRef.current !== currentPage) {
      prevPageRef.current = currentPage;
      fetchData(currentPage);
    }
  }, [currentPage, fetchData]);



  const fetchRecordForDate = useCallback(async (date: Date, useCache: boolean = true) => {
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
  }, [recordsCache, router]);

  useEffect(() => {
    const handleAssistantUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { kind?: string; date?: string }
        | undefined;

      if (detail?.kind !== 'cash_entry' || !detail.date) {
        return;
      }

      fetchData(currentPage);

      const affectedDate = parse(detail.date, 'yyyy-MM-dd', new Date());
      if (!isValid(affectedDate)) {
        return;
      }
      void fetchRecordForDate(affectedDate, false).then((record) => {
        if (!record) return;
        setViewingRecord((prev) => {
          if (!prev) return prev;
          const prevIso = format(parse(prev.date, 'dd-MM-yyyy', new Date()), 'yyyy-MM-dd');
          return prevIso === detail.date ? record : prev;
        });
      });
    };

    window.addEventListener(ASSISTANT_DATA_UPDATED_EVENT, handleAssistantUpdate);
    return () => {
      window.removeEventListener(ASSISTANT_DATA_UPDATED_EVENT, handleAssistantUpdate);
    };
  }, [currentPage, fetchData, fetchRecordForDate]);

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
    if (openingRecordId === record.id) return;

    setOpeningRecordId(record.id);
    try {
      const parsedDate = parse(record.date, 'dd-MM-yyyy', new Date());
      const recordData = await fetchRecordForDate(parsedDate, true);
      if (recordData) {
        setViewingRecord(recordData);
        setViewRecordOpen(true);
      }
    } finally {
      setOpeningRecordId((prev) => (prev === record.id ? null : prev));
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

  const handleDownloadPdf = async () => {
    if (!pdfFrom || !pdfTo) {
      toast.error('Please select both From and To dates');
      return;
    }
    if (pdfFrom > pdfTo) {
      toast.error('From date must be before To date');
      return;
    }
    setPdfDownloading(true);
    try {
      const res = await fetch(`/api/daily-cash-records/export-pdf?from=${pdfFrom}&to=${pdfTo}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cash_Report_${pdfFrom}_to_${pdfTo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded!');
      setPdfDialogOpen(false);
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download PDF');
    } finally {
      setPdfDownloading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  if (loading) {
    return (
      <div className="cash-record-page min-h-screen bg-background px-3 py-3 sm:p-6">
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
    <div className="cash-record-page min-h-screen bg-background px-3 py-3 pb-10 sm:p-6 sm:pb-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-3 sm:mb-5">
          <h1 className="app-page-title text-xl sm:text-3xl">
            Daily cash record
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
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
                className="cash-record-action-primary h-10 w-full rounded-lg sm:h-9 sm:w-auto sm:shrink-0 text-xs sm:text-sm px-2 sm:px-4"
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
                className="cash-record-action-secondary h-10 w-full rounded-lg sm:h-9 sm:w-auto sm:shrink-0 text-xs sm:text-sm px-2 sm:px-4"
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

          <Dialog open={pdfDialogOpen} onOpenChange={(open) => {
            setPdfDialogOpen(open);
            if (!open) { setPdfFrom(''); setPdfTo(''); }
          }}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="cash-record-action-secondary h-10 w-full rounded-lg sm:h-9 sm:w-auto sm:shrink-0 text-xs sm:text-sm px-2 sm:px-4 col-span-2 sm:col-span-1"
              >
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-2 shrink-0" />
                <span className="truncate">Download PDF</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Download Cash Report</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-slate-500">
                  Select a date range to download all transactions as a PDF.
                </p>
                <div>
                  <Label htmlFor="pdf-from">From Date</Label>
                  <Input
                    id="pdf-from"
                    type="date"
                    value={pdfFrom}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      setPdfFrom(e.target.value);
                      if (pdfTo && e.target.value > pdfTo) setPdfTo('');
                    }}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="pdf-to">To Date</Label>
                  <Input
                    id="pdf-to"
                    type="date"
                    value={pdfTo}
                    min={pdfFrom || undefined}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setPdfTo(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <Button
                  onClick={handleDownloadPdf}
                  disabled={!pdfFrom || !pdfTo || pdfDownloading}
                  className="cash-record-action-primary w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {pdfDownloading ? 'Generating...' : 'Download PDF'}
                </Button>
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
                        disabled={openingRecordId === record.id}
                        className={`cash-record-card group w-full text-left transition-all duration-200 max-sm:border-b max-sm:rounded-none sm:rounded-xl sm:border sm:shadow-sm sm:hover:-translate-y-0.5 sm:hover:shadow-md ${
                          openingRecordId === record.id
                            ? 'cursor-wait opacity-85 pointer-events-none'
                            : 'cursor-pointer'
                        } ${
                          index === summaryRecords.length - 1 ? 'max-sm:border-b-0' : ''
                        }`}
                      >
                        <div className="px-3 pt-2.5 pb-2 sm:px-4 sm:pt-4 sm:pb-3 max-sm:px-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                              <span className="truncate text-sm font-semibold tabular-nums text-foreground sm:text-base">
                                {record.date}
                              </span>
                            </div>
                            {openingRecordId === record.id ? (
                              <span className="cash-record-pill inline-flex items-center gap-1.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium sm:text-xs">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Opening...
                              </span>
                            ) : (
                              <span className="cash-record-pill shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium sm:text-xs">
                                {record.entryCount} {record.entryCount === 1 ? 'entry' : 'entries'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="cash-record-summary mx-3 mb-2.5 overflow-hidden rounded-lg border max-sm:mx-3.5 sm:mx-4 sm:mb-4">
                          <div className="cash-record-row-in flex items-center justify-between gap-2 px-2.5 py-2 text-sm sm:px-3">
                            <span className="font-medium">In</span>
                            <span className="font-semibold tabular-nums">
                              {formatCurrency(record.totalIn)}
                            </span>
                          </div>
                          <div className="cash-record-row-out flex items-center justify-between gap-2 border-t px-2.5 py-2 text-sm sm:px-3">
                            <span className="font-medium">Out</span>
                            <span className="font-semibold tabular-nums">
                              {formatCurrency(record.totalOut)}
                            </span>
                          </div>
                          <div
                            className={`flex items-center justify-between gap-2 border-t-2 px-2.5 py-2.5 text-sm sm:px-3 sm:py-3 ${
                              record.totalLeft >= 0
                                ? 'cash-record-row-balance border-emerald-200'
                                : 'cash-record-row-balance-negative border-rose-300'
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
          <DialogContent className="cash-record-dialog flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:max-h-[92vh] sm:w-full sm:max-w-[92vw] lg:max-w-5xl">
            <DialogHeader className="cash-record-dialog-header flex-shrink-0 border-b-4 px-3.5 pb-3 pr-14 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="min-w-0">
                  <p className="cash-record-dialog-eyebrow text-[10px] font-black uppercase tracking-wide font-mono">
                    Daily cash entries
                  </p>
                  <DialogTitle className="cash-record-dialog-title mt-1 truncate text-xl font-black uppercase leading-none tracking-tight font-mono sm:text-2xl">
                    {viewingRecord?.date || format(selectedDate, 'dd-MM-yyyy')}
                  </DialogTitle>
                </div>

                {viewingRecord && (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="cash-record-modal-stat cash-record-modal-stat-in min-w-0 rounded-md border-2 px-2.5 py-1.5">
                        <p className="cash-record-modal-stat-label text-[9px] font-black uppercase tracking-wide font-mono sm:text-[10px]">Money In</p>
                        <p className="cash-record-modal-stat-value truncate text-sm font-black font-mono sm:text-base">{formatCurrency(viewingRecord.totalIn)}</p>
                      </div>

                      <div className="cash-record-modal-stat cash-record-modal-stat-out min-w-0 rounded-md border-2 px-2.5 py-1.5">
                        <p className="cash-record-modal-stat-label text-[9px] font-black uppercase tracking-wide font-mono sm:text-[10px]">Money Out</p>
                        <p className="cash-record-modal-stat-value truncate text-sm font-black font-mono sm:text-base">{formatCurrency(viewingRecord.totalOut)}</p>
                      </div>

                      <div className={`cash-record-modal-stat min-w-0 rounded-md border-2 px-2.5 py-1.5 ${
                        viewingRecord.totalLeft >= 0 ? 'cash-record-modal-stat-balance' : 'cash-record-modal-stat-out'
                      }`}>
                        <p className="cash-record-modal-stat-label text-[9px] font-black uppercase tracking-wide font-mono sm:text-[10px]">Balance</p>
                        <p className="cash-record-modal-stat-value truncate text-sm font-black font-mono sm:text-base">
                          {formatCurrency(viewingRecord.totalLeft)}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={() => {
                        setRecordDate(parse(viewingRecord.date, 'dd-MM-yyyy', new Date()));
                        setAmount('');
                        setDescription('');
                        setEntryType('in');
                        setAddTransactionOpen(true);
                      }}
                      size="sm"
                      className="cash-record-action-primary h-8 w-fit justify-self-start gap-1.5 rounded-md px-3 text-xs font-black uppercase font-mono sm:h-9 sm:justify-self-end sm:px-3.5"
                    >
                      <Plus className="h-3.5 w-3.5 stroke-[3px]" />
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>
            <div className="cash-record-dialog-body flex-1 overflow-auto overscroll-contain p-3 sm:p-4 lg:p-5">
              {viewingRecord && viewingRecord.entries && viewingRecord.entries.length > 0 ? (
                <>
                  <div className="block space-y-3 lg:hidden">
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
                          className="cash-record-entry-card rounded-lg border-2 p-3 text-left"
                        >
                          <div className="mb-2.5 flex min-w-0 items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`shrink-0 rounded border-2 px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_var(--neo-shadow)] ${
                                entry.type === 'in'
                                  ? 'cash-record-entry-type-in'
                                  : 'cash-record-entry-type-out'
                              }`}>
                                {entry.type === 'in' ? 'IN' : 'OUT'}
                              </span>
                              <p className="cash-record-entry-date truncate text-xs font-bold font-mono">{entryDate}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {entry.billUrl && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setBillViewUrl(entry.billUrl!); setBillViewOpen(true); }}
                                  aria-label="View bill"
                                  title="View bill"
                                  className="cash-record-icon-button h-7 w-7 rounded border-2 p-0 transition-all"
                                >
                                  <FileText className="h-3.5 w-3.5 stroke-[2.5px]" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditEntry(entry, viewingRecord)}
                                aria-label="Edit entry"
                                title="Edit entry"
                                className="cash-record-icon-button h-7 w-7 rounded border-2 p-0 transition-all"
                              >
                                <Edit2 className="h-3.5 w-3.5 stroke-[2.5px]" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="cash-record-entry-detail flex min-w-0 items-center justify-between gap-2 rounded border-2 p-2">
                            <p className="cash-record-entry-description min-w-0 flex-1 truncate text-sm font-extrabold">{entry.description}</p>
                            <span className={`shrink-0 truncate rounded border-2 px-2 py-0.5 text-xs font-black shadow-[1px_1px_0px_var(--neo-shadow)] font-mono sm:text-sm ${
                              entry.type === 'in' ? 'cash-record-entry-amount-in' : 'cash-record-entry-amount-out'
                            }`}>
                              {entry.type === 'out' && '-'}{formatCurrency(entry.amount)}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="cash-record-table-wrap hidden overflow-hidden rounded-lg border-2 lg:block">
                    <Table className="min-w-[860px]">
                      <TableHeader className="cash-record-table-header [&_tr]:border-b-2">
                        <TableRow>
                          <TableHead className="cash-record-table-head-cell h-10 px-4 py-2 text-[11px] font-black uppercase font-mono">Date</TableHead>
                          <TableHead className="cash-record-table-head-cell h-10 px-4 py-2 text-[11px] font-black uppercase font-mono">Description</TableHead>
                          <TableHead className="cash-record-table-head-cell h-10 px-4 py-2 text-right text-[11px] font-black uppercase font-mono">Money Out</TableHead>
                          <TableHead className="cash-record-table-head-cell h-10 px-4 py-2 text-right text-[11px] font-black uppercase font-mono">Money In</TableHead>
                          <TableHead className="cash-record-table-head-cell h-10 w-20 px-3 py-2 text-center text-[11px] font-black uppercase font-mono">Bill</TableHead>
                          <TableHead className="cash-record-table-head-cell h-10 w-20 px-3 py-2 text-center text-[11px] font-black uppercase font-mono">Edit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_tr]:border-b-2 [&_tr:last-child]:border-b-0">
                        {viewingRecord.entries.map((entry) => {
                          const entryDate = entry.createdAt
                            ? format(new Date(entry.createdAt), 'dd-MM-yyyy')
                            : viewingRecord.date;
                          return (
                            <TableRow key={entry.id} className="cash-record-table-row">
                              <TableCell className="cash-record-table-cell px-4 py-3 text-sm font-mono">{entryDate}</TableCell>
                              <TableCell className="cash-record-table-cell max-w-[320px] px-4 py-3 text-sm font-bold">
                                <span className="block truncate" title={entry.description}>{entry.description}</span>
                              </TableCell>
                              <TableCell className="cash-record-table-cell px-4 py-3 text-right">
                                {entry.type === 'out' ? (
                                  <span className="cash-record-entry-amount-out rounded border-2 px-2 py-0.5 text-xs font-black shadow-[1px_1px_0px_var(--neo-shadow)] font-mono">{formatCurrency(entry.amount)}</span>
                                ) : (
                                  <span className="cash-record-entry-muted text-sm font-mono">-</span>
                                )}
                              </TableCell>
                              <TableCell className="cash-record-table-cell px-4 py-3 text-right">
                                {entry.type === 'in' ? (
                                  <span className="cash-record-entry-amount-in rounded border-2 px-2 py-0.5 text-xs font-black shadow-[1px_1px_0px_var(--neo-shadow)] font-mono">{formatCurrency(entry.amount)}</span>
                                ) : (
                                  <span className="cash-record-entry-muted text-sm font-mono">-</span>
                                )}
                              </TableCell>
                              <TableCell className="cash-record-table-cell px-3 py-3 text-center">
                                {entry.billUrl ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setBillViewUrl(entry.billUrl!); setBillViewOpen(true); }}
                                    className="cash-record-icon-button h-7 w-7 rounded border-2 p-0 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[0px] active:translate-y-[0px]"
                                    title="View bill"
                                    aria-label="View bill"
                                  >
                                    <FileText className="h-3.5 w-3.5 stroke-[2.5px]" />
                                  </Button>
                                ) : (
                                  <span className="cash-record-entry-muted text-sm font-mono">-</span>
                                )}
                              </TableCell>
                              <TableCell className="cash-record-table-cell px-3 py-3 text-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditEntry(entry, viewingRecord)}
                                  className="cash-record-icon-button h-7 w-7 rounded border-2 p-0 transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[0px] active:translate-y-[0px]"
                                  title="Edit entry"
                                  aria-label="Edit entry"
                                >
                                  <Edit2 className="h-3.5 w-3.5 stroke-[2.5px]" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="cash-record-empty-state flex flex-col items-center justify-center py-16 text-center border-4 border-dashed rounded-lg p-6">
                  <div className="cash-record-pill w-16 h-16 rounded-lg border-2 flex items-center justify-center mb-4">
                    <CalendarIcon className="h-8 w-8 stroke-[2.5px]" />
                  </div>
                  <p className="text-lg font-black font-mono uppercase text-foreground mb-1">No entries yet</p>
                  <p className="cash-record-entry-date text-sm font-medium">Add your first transaction for this date</p>
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
