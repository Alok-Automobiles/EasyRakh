'use client';

import { useState, useEffect, useRef, ChangeEvent, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'motion/react'
import PrintLedgerOverlay from '@/components/PrintLedgerOverlay';

interface LedgerEntry {
  date: Date;
  description: string;
  credit: number;
  debit: number;
  balance: number;
  billUrl?: string;
  billPublicId?: string;
  transactionId?: string;
}

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

interface LedgerData {
  entity: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    openingBalance: number;
    balanceType: 'credit' | 'debit';
  };
  entityType: string;
  openingBalance: {
    amount: number;
    type: 'credit' | 'debit';
  };
  entries: LedgerEntry[];
  totals: {
    credit: number;
    debit: number;
    balance: number;
  };
}

export default function LedgerPage() {
  const router = useRouter();
  const params = useParams();
  const entityType = params.entityType as string;
  const entityId = params.entityId as string;
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const lastFetchedRef = useRef<string>('');
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<(LedgerEntry & { transactionId?: string }) | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<{
    id: string;
    entityType: string;
    entityId: string;
    type: 'credit' | 'debit';
    amount: number;
    description?: string;
    date: string;
    billUrl?: string;
    billPublicId?: string;
  } | null>(null);
  const [billModalLoading, setBillModalLoading] = useState(false);
  const [billModalUploading, setBillModalUploading] = useState(false);
  const billModalFileInputRef = useRef<HTMLInputElement>(null);
  const [printOverlayOpen, setPrintOverlayOpen] = useState(false);
  const [firmInfo, setFirmInfo] = useState<{
    firmTitle: string;
    gstNumber: string;
    firmPhone: string;
    firmEmail: string;
    firmAddress: string;
  } | null>(null);
  const [collectionTypeName, setCollectionTypeName] = useState<string>('');

  const fetchLedger = useCallback(async () => {
    try {
      const response = await fetch(`/api/ledger/${entityType}/${entityId}`);
      if (response.ok) {
        const data = await response.json();
        setLedgerData(data);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        toast.error('Failed to fetch ledger');
      }
    } catch (error) {
      console.error('Failed to fetch ledger data', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, router]);

  useEffect(() => {
    if (!entityId || !entityType) return;
    const fetchKey = `${entityType}-${entityId}`;
    if (lastFetchedRef.current === fetchKey) return;
    lastFetchedRef.current = fetchKey;
    fetchLedger();
  }, [entityId, entityType, fetchLedger]);

  useEffect(() => {
    if (entityType && entityType !== 'customer' && entityType !== 'supplier') {
      fetch(`/api/collection-types`)
        .then((res) => res.json())
        .then((data) => {
          const ct = data.collectionTypes?.find((ct: { slug: string }) => ct.slug === entityType);
          if (ct) {
            setCollectionTypeName(ct.name);
          }
        })
        .catch(() => { });
    }
  }, [entityType]);

  const loadTransactionDetails = async (transactionId: string) => {
    setBillModalLoading(true);
    try {
      const response = await fetch(`/api/transactions/${transactionId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load transaction');
      }
      const data = await response.json();
      const tx = data.transaction;
      setSelectedTransaction({
        id: transactionId,
        entityType: tx.entityType,
        entityId: tx.entityId,
        type: tx.type,
        amount: tx.amount,
        description: tx.description || '',
        date: format(new Date(tx.date), 'yyyy-MM-dd'),
        billUrl: tx.billUrl,
        billPublicId: tx.billPublicId,
      });
    } catch (error) {
      console.error('Failed to load bill details', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load bill details');
      setBillModalOpen(false);
      setSelectedEntry(null);
    } finally {
      setBillModalLoading(false);
    }
  };

  const handleViewBill = (entry: LedgerEntry) => {
    if (!entry.transactionId) {
      toast.error('Unable to locate the transaction for this entry.');
      return;
    }
    setSelectedEntry(entry);
    setBillModalOpen(true);
    loadTransactionDetails(entry.transactionId);
  };

  const handleBillModalOpenChange = (open: boolean) => {
    setBillModalOpen(open);
    if (!open) {
      setSelectedEntry(null);
      setSelectedTransaction(null);
      if (billModalFileInputRef.current) {
        billModalFileInputRef.current.value = '';
      }
    }
  };

  const submitBillUpdate = async (
    update: { billUrl: string; billPublicId: string },
    successMessage: string
  ) => {
    if (!selectedTransaction) return;
    setBillModalUploading(true);
    try {
      const payload = {
        entityType: selectedTransaction.entityType,
        entityId: selectedTransaction.entityId,
        type: selectedTransaction.type,
        amount: selectedTransaction.amount,
        description: selectedTransaction.description || '',
        date: selectedTransaction.date,
        billUrl: update.billUrl,
        billPublicId: update.billPublicId,
      };

      const response = await fetch(`/api/transactions/${selectedTransaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update bill');
      }

      const result = await response.json();
      const updatedBillUrl = result.transaction.billUrl;
      const updatedBillPublicId = result.transaction.billPublicId;

      setSelectedTransaction((prev) =>
        prev
          ? {
            ...prev,
            billUrl: updatedBillUrl,
            billPublicId: updatedBillPublicId,
          }
          : prev
      );
      setSelectedEntry((prev) =>
        prev
          ? {
            ...prev,
            billUrl: updatedBillUrl,
            billPublicId: updatedBillPublicId,
          }
          : prev
      );
      setLedgerData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((entry) =>
            entry.transactionId === selectedTransaction.id
              ? { ...entry, billUrl: updatedBillUrl, billPublicId: updatedBillPublicId }
              : entry
          ),
        };
      });
      toast.success(successMessage);
    } catch (error) {
      console.error('Failed to update bill', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update bill');
    } finally {
      setBillModalUploading(false);
      if (billModalFileInputRef.current) {
        billModalFileInputRef.current.value = '';
      }
    }
  };

  const handleReplaceBill = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Upload JPG, PNG, WEBP, HEIC/HEIF, or PDF.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_BILL_SIZE_BYTES) {
      toast.error('File size exceeds 5MB limit.');
      event.target.value = '';
      return;
    }

    setBillModalUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/uploads/bill', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload bill');
      }

      const result = await response.json();
      await submitBillUpdate(
        { billUrl: result.url, billPublicId: result.publicId },
        'Bill updated successfully.'
      );
    } catch (error) {
      console.error('Failed to upload bill', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload bill');
    } finally {
      setBillModalUploading(false);
      if (billModalFileInputRef.current) {
        billModalFileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteBill = async () => {
    if (!selectedTransaction?.billUrl) {
      toast.error('No bill attached to remove.');
      return;
    }
    await submitBillUpdate({ billUrl: '', billPublicId: '' }, 'Bill removed successfully.');
  };

  const fetchFirmInfo = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setFirmInfo({
            firmTitle: data.user.firmTitle || '',
            gstNumber: data.user.gstNumber || '',
            firmPhone: data.user.firmPhone || '',
            firmEmail: data.user.firmEmail || '',
            firmAddress: data.user.firmAddress || '',
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch firm info', error);
    }
  };

  const handlePrintClick = async () => {
    await fetchFirmInfo();
    setPrintOverlayOpen(true);
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.3 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-9 w-48 mb-6" />
          <Skeleton className="h-32 mb-6" />
          <Skeleton className="h-96" />
        </div>
      </motion.div>
    );
  }

  if (!ledgerData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.3 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">Ledger not found</div>
        </div>
      </motion.div>
    );
  }

  const { entity, openingBalance, entries, totals } = ledgerData;
  const finalBalanceColor = totals.balance >= 0 ? 'text-green-600' : 'text-red-600';

  let entityName = 'Entities';
  let backLink = '/';
  if (entityType === 'customer') {
    entityName = 'Customers';
    backLink = '/customers';
  } else if (entityType === 'supplier') {
    entityName = 'Suppliers';
    backLink = '/suppliers';
  } else {
    entityName = collectionTypeName || 'Entities';
    backLink = `/custom-entities/${entityType}`;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.3 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href={backLink}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
          >
            ← Back to {entityName}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{entity.name} - Ledger</h1>
          {entity.phone && (
            <p className="text-gray-600 mt-1">Phone: {entity.phone}</p>
          )}
          {entity.email && (
            <p className="text-gray-600">Email: {entity.email}</p>
          )}
          {entity.address && (
            <p className="text-gray-600 mt-1">{entity.address}</p>
          )}
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Opening Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">Amount:</span>
              <span
                className={`text-2xl font-bold ${openingBalance.type === 'credit' ? 'text-green-600' : 'text-red-600'
                  }`}
              >
                {openingBalance.type === 'credit' ? '+' : '-'}₹
                {openingBalance.amount.toLocaleString()}
              </span>
              <span className="text-sm text-gray-500">
                ({openingBalance.type === 'credit' ? 'You owe them' : 'They owe you'})
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bill
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Opening Balance Row */}
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Opening Balance
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    —
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                    {openingBalance.type === 'credit' ? `₹${openingBalance.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                    {openingBalance.type === 'debit' ? `₹${openingBalance.amount.toLocaleString()}` : '-'}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${openingBalance.type === 'credit' ? 'text-green-600' : 'text-red-600'
                      }`}
                  >
                    {openingBalance.type === 'credit' ? '-' : ''}₹
                    {openingBalance.amount.toLocaleString()}
                  </td>
                </tr>

                {/* Transaction Entries */}
                {entries.map((entry, index) => {
                  const balanceColor = entry.balance >= 0 ? 'text-green-600' : 'text-red-600';
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(entry.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {entry.description || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.billUrl && entry.transactionId ? (
                          <Button
                            type="button"
                            variant="link"
                            className="px-0 text-blue-600"
                            onClick={() => handleViewBill(entry)}
                          >
                            View Bill
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : '-'}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${balanceColor}`}
                      >
                        {entry.balance >= 0 ? '' : '-'}₹{Math.abs(entry.balance).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100">
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
                  >
                    Total
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                    ₹{totals.credit.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600">
                    ₹{totals.debit.toLocaleString()}
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-lg ${finalBalanceColor}`}
                  >
                    {totals.balance >= 0 ? '' : '-'}₹{Math.abs(totals.balance).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={handlePrintClick}>
            Print/Download
          </Button>
          <Button asChild>
            <Link href={`/transactions/new?entityType=${entityType}&entityId=${entityId}`}>
              Add Transaction
            </Link>
          </Button>
        </div>

        <Dialog open={billModalOpen} onOpenChange={handleBillModalOpenChange}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Bill Attachment</DialogTitle>
              <DialogDescription>
                {selectedEntry
                  ? `Transaction on ${format(new Date(selectedEntry.date), 'MMM dd, yyyy')}`
                  : 'View and manage the uploaded bill'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {billModalLoading ? (
                <p className="text-sm text-muted-foreground">Loading bill...</p>
              ) : selectedTransaction?.billUrl ? (
                <>
                  {selectedTransaction.billUrl.toLowerCase().includes('.pdf') ? (
                    <div className="rounded border border-dashed p-4 text-sm text-gray-700">
                      Bill is a PDF document.
                    </div>
                  ) : (
                    <Image
                      src={selectedTransaction.billUrl}
                      alt="Bill preview"
                      width={800}
                      height={600}
                      unoptimized
                      className="w-full max-h-96 rounded-md object-contain border"
                    />
                  )}
                  {/* <a
                  href={selectedTransaction.billUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Open in new tab
                </a> */}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No bill attached to this transaction.</p>
              )}

              <div className="space-y-2">
                <input
                  ref={billModalFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                  className="hidden"
                  onChange={handleReplaceBill}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => billModalFileInputRef.current?.click()}
                    disabled={billModalUploading || billModalLoading}
                  >
                    {selectedTransaction?.billUrl ? 'Replace Bill' : 'Upload Bill'}
                  </Button>
                  {selectedTransaction?.billUrl && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDeleteBill}
                      disabled={billModalUploading || billModalLoading}
                    >
                      Remove Bill
                    </Button>
                  )}
                </div>
                {billModalUploading && (
                  <p className="text-sm text-muted-foreground">Processing...</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleBillModalOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PrintLedgerOverlay
          open={printOverlayOpen}
          onClose={() => setPrintOverlayOpen(false)}
          ledgerData={ledgerData}
          initialFirmInfo={firmInfo}
        />
      </div>
    </motion.div>
  );
}

