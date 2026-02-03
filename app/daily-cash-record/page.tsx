'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, parse } from 'date-fns';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
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
import { Edit2, CalendarIcon, Plus } from 'lucide-react';
import { motion } from 'motion/react'

interface CashEntry {
  id: string;
  amount: number;
  type: 'in' | 'out';
  description: string;
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
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Title Section */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">daily cash record</h1>

        <Separator className="mb-6" />

        {/* Buttons Section */}
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
          <Dialog open={createNewRecordOpen} onOpenChange={(open) => {
            setCreateNewRecordOpen(open);
            if (!open) setShowCreateCalendar(false);
          }}>
            <DialogTrigger asChild>
              <Button
                onClick={handleCreateRecordForToday}
                variant="outline"
                className="rounded-lg w-full sm:w-auto"
              >
                create new record for today
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
                <Button
                  onClick={handleCreateRecord}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
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
                className="rounded-lg w-full sm:w-auto"
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                select date to prev records
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

        <Separator className="mb-6" />

        {/* Records Display Section */}
        <div className="mt-8">
          <div className="rounded-lg border bg-white p-6 min-h-[400px] shadow-sm">
            {summaryRecords.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {summaryRecords.map((record, index) => (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <Card
                        className="group hover:shadow-2xl transition-all duration-300 cursor-pointer rounded-2xl border-2 border-gray-100 hover:border-blue-200 overflow-hidden bg-gradient-to-br from-white to-gray-50 hover:scale-[1.02]"
                        onClick={() => handleViewRecord(record)}
                      >
                        <CardContent className="p-5 sm:p-6">
                          <div className="space-y-4">
                            {/* Date Header */}
                            <div className="flex items-center justify-between pb-3 border-b-2 border-gray-200">
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-blue-600" />
                                <span className="text-lg font-bold text-gray-900">{record.date}</span>
                              </div>
                              <div className="bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                                {record.entryCount} {record.entryCount === 1 ? 'entry' : 'entries'}
                              </div>
                            </div>

                            {/* Money Stats */}
                            <div className="space-y-3">
                              {/* Money In */}
                              <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                  <span className="text-sm font-semibold text-green-700">Money In</span>
                                </div>
                                <span className="font-bold text-green-700 text-base">
                                  {formatCurrency(record.totalIn)}
                                </span>
                              </div>

                              {/* Money Out */}
                              <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                  <span className="text-sm font-semibold text-red-700">Money Out</span>
                                </div>
                                <span className="font-bold text-red-700 text-base">
                                  {formatCurrency(record.totalOut)}
                                </span>
                              </div>
                            </div>

                            {/* Total Left */}
                            <div className={`flex items-center justify-between p-4 rounded-xl border-2 ${
                              record.totalLeft >= 0 
                                ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-300' 
                                : 'bg-gradient-to-r from-red-100 to-rose-100 border-red-300'
                            }`}>
                              <span className="text-sm font-bold text-gray-800">Total Balance</span>
                              <span className={`font-black text-xl ${
                                record.totalLeft >= 0 ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {formatCurrency(record.totalLeft)}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
                <div className="flex justify-end mt-6">
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
              <div className="text-center py-16 text-gray-500">
                <p className="text-lg mb-2">prev days recent records in</p>
                <p className="text-sm">pagination</p>
              </div>
            )}
          </div>
        </div>

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
          if (!open) setShowAddTransactionCalendar(false);
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
              <Button
                onClick={handleAddTransaction}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Add Transaction
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Entry Dialog */}
        <Dialog open={editEntryOpen} onOpenChange={(open) => {
          setEditEntryOpen(open);
          if (!open) setShowEditCalendar(false);
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
              <Button
                onClick={handleUpdateEntry}
                className="w-full"
              >
                Update Entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
