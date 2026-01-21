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

        // Invalidate dashboard cache so daily cash totals update
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

        // Invalidate dashboard cache so daily cash totals update
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

        // Invalidate dashboard cache so daily cash totals update
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
                <div className="space-y-4 mb-6">
                  {summaryRecords.map((record) => (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Card
                        className="hover:shadow-lg transition-shadow cursor-pointer rounded-lg border-2"
                        onClick={() => handleViewRecord(record)}
                      >
                        <CardContent className="p-6">
                          <div className="space-y-3">
                            <div className="text-lg font-semibold text-gray-900 border-b pb-2">
                              {record.date}
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-green-600 font-medium">Money In:</span>
                              <span className="font-semibold text-gray-900">{formatCurrency(record.totalIn)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-red-600 font-medium">Money Out:</span>
                              <span className="font-semibold text-gray-900">{formatCurrency(record.totalOut)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t">
                              <span className="font-bold text-gray-700">Total Left:</span>
                              <span className={`font-bold text-lg ${record.totalLeft >= 0 ? 'text-green-600' : 'text-red-600'
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
          <DialogContent className="max-w-[90vw] sm:max-w-6xl max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 pr-16 flex-shrink-0 border-b border-gray-200">
              <div className="flex flex-row items-center justify-between gap-4">
                <DialogTitle className="text-xl flex-1">
                  Records for {viewingRecord?.date || format(selectedDate, 'dd-MM-yyyy')}
                </DialogTitle>
                {viewingRecord && (
                  <Button
                    onClick={() => {
                      setRecordDate(parse(viewingRecord.date, 'dd-MM-yyyy', new Date()));
                      setAmount('');
                      setDescription('');
                      setEntryType('in');
                      setAddTransactionOpen(true);
                    }}
                    size="sm"
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Add Transaction
                  </Button>
                )}
              </div>
            </DialogHeader>
            <div className="px-6 pb-6 overflow-auto flex-1 min-h-0">
              {viewingRecord && viewingRecord.entries && viewingRecord.entries.length > 0 ? (
                <div className="rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 bg-gray-50 z-10">
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="font-semibold text-left px-4 py-3 whitespace-nowrap min-w-[120px]">DATE</TableHead>
                          <TableHead className="font-semibold text-left px-4 py-3 min-w-[300px]">description</TableHead>
                          <TableHead className="font-semibold text-left px-4 py-3 whitespace-nowrap min-w-[130px]">money out</TableHead>
                          <TableHead className="font-semibold text-right px-4 py-3 whitespace-nowrap min-w-[130px]">money in</TableHead>
                          <TableHead className="w-[80px] px-4 py-3 text-center">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewingRecord.entries.map((entry) => {
                          const entryDate = entry.createdAt
                            ? format(new Date(entry.createdAt), 'dd-MM-yyyy')
                            : viewingRecord.date;
                          return (
                            <TableRow key={entry.id} className="hover:bg-gray-50 border-b border-gray-200">
                              <TableCell className="px-4 py-3 font-medium whitespace-nowrap">{entryDate}</TableCell>
                              <TableCell className="px-4 py-3 break-words whitespace-normal">
                                {entry.description}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-red-600 whitespace-nowrap font-medium">
                                {entry.type === 'out' ? formatCurrency(entry.amount) : '-'}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-right text-green-600 whitespace-nowrap font-medium">
                                {entry.type === 'in' ? formatCurrency(entry.amount) : '-'}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-center">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditEntry(entry, viewingRecord)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Summary Row: total in/out */}
                        <TableRow className="bg-gray-50 border-t-2 border-gray-300">
                          <TableCell className="px-4 py-3 font-semibold">total in/out</TableCell>
                          <TableCell className="px-4 py-3"></TableCell>
                          <TableCell className="px-4 py-3 font-semibold text-red-600">
                            {formatCurrency(viewingRecord.totalOut)}
                          </TableCell>
                          <TableCell className="px-4 py-3 font-semibold text-right text-green-600">
                            {formatCurrency(viewingRecord.totalIn)}
                          </TableCell>
                          <TableCell className="px-4 py-3"></TableCell>
                        </TableRow>
                        {/* Summary Row: total left */}
                        <TableRow className="bg-gray-100 border-t-2 border-gray-300">
                          <TableCell className="px-4 py-3 font-semibold">total left</TableCell>
                          <TableCell className="px-4 py-3"></TableCell>
                          <TableCell className="px-4 py-3"></TableCell>
                          <TableCell className="px-4 py-3 font-bold text-lg text-right text-black">
                            {formatCurrency(viewingRecord.totalLeft)}
                          </TableCell>
                          <TableCell className="px-4 py-3"></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No entries found for this date
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
