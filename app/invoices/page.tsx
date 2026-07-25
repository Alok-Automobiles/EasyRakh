'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  FileText,
  Plus,
  Search,
  Download,
  Trash2,
  Share2,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Invoice } from '@/lib/types';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

interface InvoiceWithId extends Invoice {
  id: string;
}

interface InvoicesResponse {
  invoices: InvoiceWithId[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const statusConfig = {
  paid: {
    label: 'Paid',
    icon: CheckCircle2,
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  partial: {
    label: 'Partial',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  unpaid: {
    label: 'Unpaid',
    icon: AlertCircle,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
};

export default function InvoicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<{ id: string; invoiceNumber: string; addedToLedger: boolean } | null>(null);
  const [deleteTransactions, setDeleteTransactions] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        router.push('/invoices/new');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ['invoices', searchQuery, statusFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', currentPage.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/invoices?${params.toString()}`);
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json();
    },
  });

  const invoices = data?.invoices ?? [];

  const deleteMutation = useMutation({
    mutationFn: async ({ id, deleteTransactions }: { id: string; deleteTransactions: boolean }) => {
      const url = `/api/invoices/${id}?deleteTransactions=${deleteTransactions}`;
      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete invoice');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Invoice deleted successfully!');
      setDeleteDialogOpen(false);
      setDeletingInvoice(null);
      setDeleteTransactions(false);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete invoice');
    },
  });

  const openDeleteDialog = (invoice: InvoiceWithId) => {
    setDeletingInvoice({ 
      id: invoice.id, 
      invoiceNumber: invoice.invoiceNumber,
      addedToLedger: invoice.addedToLedger 
    });
    setDeleteTransactions(false); // Reset to false
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!deletingInvoice) return;
    deleteMutation.mutate({ id: deletingInvoice.id, deleteTransactions });
  };

  const handleDownload = async (invoice: InvoiceWithId) => {
    setDownloadingInvoiceId(invoice.id);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/download`);

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (response.status === 409) {
        const result = await response.json().catch(() => ({}));
        if (result.code === 'FIRM_DETAILS_REQUIRED') {
          router.push(`/invoices/${invoice.id}?download=true`);
          return;
        }
      }

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to download invoice');
      }

      const pdfBlob = await response.blob();
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      toast.success('Invoice downloaded');
    } catch (error) {
      console.error('Failed to download invoice:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download invoice');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (data?.pagination && currentPage < data.pagination.totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center mb-6">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 shadow-sm">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Invoices</h1>
              <p className="text-gray-500 text-sm">
                {data?.pagination?.total ?? invoices.length} {(data?.pagination?.total ?? invoices.length) === 1 ? 'invoice' : 'invoices'}
              </p>
            </div>
          </div>
          <Button
            asChild
            className="bg-slate-900 hover:bg-slate-800"
            title="Shortcut: Ctrl+N / Cmd+N"
          >
            <Link href="/invoices/new">
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by customer name or invoice number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="w-4 h-4 mr-2 text-gray-400" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoice List */}
        {invoices.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-100 flex items-center justify-center">
              <FileText className="w-10 h-10 text-blue-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No invoices yet</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Create your first invoice to start tracking your sales and payments.
            </p>
            <Button
              asChild
              className="bg-slate-900 hover:bg-slate-800"
              title="Shortcut: Ctrl+N / Cmd+N"
            >
              <Link href="/invoices/new">
                <Plus className="w-4 h-4 mr-2" />
                Create your first invoice
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const status = statusConfig[invoice.status];
              const StatusIcon = status.icon;

              const openInvoice = () => router.push(`/invoices/${invoice.id}`);

              return (
                <motion.div
                  key={invoice.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="button"
                  tabIndex={0}
                  onClick={openInvoice}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openInvoice();
                    }
                  }}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-all p-4 sm:p-5 cursor-pointer"
                  aria-label={`Open invoice ${invoice.invoiceNumber}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Invoice Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {invoice.invoiceNumber}
                        </h3>
                        <Badge variant="outline" className={status.className}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {status.label}
                        </Badge>
                        {invoice.addedToLedger && (
                          <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                            In Ledger
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">{invoice.customerName}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(invoice.createdAt), 'MMM dd, yyyy \'at\' h:mm a')}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {currencyFormatter.format(invoice.totalAmount)}
                        </p>
                        {invoice.status === 'partial' && (
                          <p className="text-xs text-gray-500">
                            Paid: {currencyFormatter.format(invoice.paidAmount)}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          title="Download PDF"
                          aria-label={`Download invoice ${invoice.invoiceNumber}`}
                          disabled={downloadingInvoiceId === invoice.id}
                          onClick={() => handleDownload(invoice)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          title="Share Invoice"
                          asChild
                        >
                          <Link href={`/invoices/${invoice.id}?share=true`}>
                            <Share2 className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete Invoice"
                          onClick={() => openDeleteDialog(invoice)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
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
              {Array.from({ length: Math.min(data.pagination.totalPages, 5) }, (_, i) => {
                let page: number;
                if (data.pagination.totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= data.pagination.totalPages - 2) {
                  page = data.pagination.totalPages - 4 + i;
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
              disabled={currentPage >= (data.pagination?.totalPages ?? 1)}
              variant="outline"
              size="sm"
              className="border-gray-300"
            >
              Next
            </Button>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Invoice</DialogTitle>
              <DialogDescription asChild>
                <div className="pt-2 space-y-2 text-sm text-muted-foreground">
                  <p>
                    Are you sure you want to delete invoice{' '}
                    <span className="font-semibold text-red-700">{deletingInvoice?.invoiceNumber}</span>?
                  </p>
                  <p className="font-medium text-gray-500">
                    This action cannot be undone.
                  </p>
                  {deletingInvoice?.addedToLedger && (
                    <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm font-medium text-amber-900 mb-2">
                        This invoice is linked to the customer&apos;s ledger.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deleteTransactions}
                          onChange={(e) => setDeleteTransactions(e.target.checked)}
                          className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                        />
                        <span className="text-sm text-amber-800">
                          Also delete related transactions from ledger
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDeletingInvoice(null);
                  setDeleteTransactions(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="bg-red-700 hover:bg-red-800"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}
