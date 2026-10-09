'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  FileText,
  Plus,
  Download,
  Trash2,
  Share2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { InvoiceFiltersToolbar } from '@/components/InvoiceFiltersToolbar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Invoice } from '@/lib/types';
import { useInvoiceListFilters } from '@/lib/hooks/useInvoiceListFilters';
import { formatInvoiceListDate, invoiceListParams, invoiceListUrl } from '@/lib/invoice-list-state';
import { invoiceDetailUrl } from '@/lib/invoice-navigation';

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

function InvoicesPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { draft, filters, change, clear, setPage } = useInvoiceListFilters();
  const queryString = invoiceListParams(filters).toString();
  const returnTo = invoiceListUrl(filters);
  const hasActiveFilters = Boolean(
    filters.search || filters.status !== 'all' || filters.customerId ||
    filters.startDate || filters.endDate || filters.minAmount || filters.maxAmount ||
    filters.addedToLedger !== 'all'
  );
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<{ id: string; invoiceNumber: string; addedToLedger: boolean } | null>(null);
  const [deleteTransactions, setDeleteTransactions] = useState(false);

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

  const { data, isLoading, isFetching, isError, refetch } = useQuery<InvoicesResponse>({
    queryKey: ['invoices', queryString],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams(queryString);
      params.set('page', filters.page.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/invoices?${params.toString()}`, { signal });
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json();
    },
    placeholderData: (previousData) => previousData,
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
          router.push(invoiceDetailUrl(invoice.id, returnTo, 'download'));
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
                {isLoading ? 'Loading invoices...' : `${data?.pagination?.total ?? 0} matching ${(data?.pagination?.total ?? 0) === 1 ? 'invoice' : 'invoices'}`}
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

        <InvoiceFiltersToolbar draft={draft} filters={filters} onChange={change} onClear={clear} />

        {isFetching && <p role="status" className="mb-3 text-sm text-gray-500">Updating invoices...</p>}

        {/* Invoice List */}
        {isLoading ? (
          <div className="space-y-4" aria-label="Loading invoices">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center">
            <p role="alert" className="mb-3 text-sm text-red-700">Unable to load invoices. Please try again.</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>Retry</Button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-100 flex items-center justify-center">
              <FileText className="w-10 h-10 text-blue-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {data?.pagination?.total ? 'No invoices on this page' : hasActiveFilters ? 'No matching invoices' : 'No invoices yet'}
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              {data?.pagination?.total ? 'Return to the first page to see your matches.' : hasActiveFilters ? 'Try changing or clearing a search filter.' : 'Create your first invoice to start tracking your sales and payments.'}
            </p>
            {data?.pagination?.total ? <Button type="button" onClick={() => setPage(1)}>First page</Button> : hasActiveFilters ? <Button type="button" variant="outline" onClick={clear}>Clear all filters</Button> : (
              <Button asChild className="bg-slate-900 hover:bg-slate-800" title="Shortcut: Ctrl+N / Cmd+N">
                <Link href="/invoices/new"><Plus className="w-4 h-4 mr-2" />Create your first invoice</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const status = statusConfig[invoice.status];
              const StatusIcon = status.icon;

              const openInvoice = () => router.push(invoiceDetailUrl(invoice.id, returnTo));

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
                        Invoice date {formatInvoiceListDate(invoice.invoiceDate || invoice.createdAt)}
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
                          <Link href={invoiceDetailUrl(invoice.id, returnTo, 'share')} aria-label={`Share invoice ${invoice.invoiceNumber}`}>
                            <Share2 className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Delete Invoice"
                          aria-label={`Delete invoice ${invoice.invoiceNumber}`}
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
          <Pagination
            currentPage={filters.page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
            className="mt-6"
          />
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
            <DialogFooter>
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

export default function InvoicesPage() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8"><Skeleton className="h-10 w-48" /></div>}><InvoicesPageContent /></Suspense>;
}
