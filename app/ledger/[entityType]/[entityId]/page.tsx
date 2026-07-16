'use client';

import { useState, useEffect, useRef, ChangeEvent, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { Upload, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'motion/react'
import PrintLedgerOverlay from '@/components/PrintLedgerOverlay';
import { ASSISTANT_DATA_UPDATED_EVENT } from '@/lib/assistant-events';
import { compressImage, isCompressibleImage, formatFileSize } from '@/lib/imageCompression';
import { parseNumberInput } from '@/lib/number-input';

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

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB - used for compression target
const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

type EditableAmount = number | '';

interface LedgerData {
  entity: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    openingBalance: number;
    balanceType: 'credit' | 'debit';
    openingBalanceDescription?: string;
    openingBalanceBillUrl?: string;
    openingBalanceBillPublicId?: string;
  };
  entityType: string;
  openingBalance: {
    amount: number;
    type: 'credit' | 'debit';
    description?: string;
    billUrl?: string;
    billPublicId?: string;
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
  
  // Edit transaction state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<{
    id: string;
    entityType: string;
    entityId: string;
    type: 'credit' | 'debit';
    amount: EditableAmount;
    description: string;
    date: string;
    billUrl?: string;
    billPublicId?: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  
  // Delete transaction state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Opening balance edit state
  const [openingBalanceModalOpen, setOpeningBalanceModalOpen] = useState(false);
  const [openingBalanceEditData, setOpeningBalanceEditData] = useState<{
    amount: EditableAmount;
    balanceType: 'credit' | 'debit';
    description: string;
    billUrl: string;
    billPublicId: string;
  } | null>(null);
  const [openingBalanceSaving, setOpeningBalanceSaving] = useState(false);
  const [openingBalanceUploading, setOpeningBalanceUploading] = useState(false);
  const openingBalanceFileInputRef = useRef<HTMLInputElement>(null);

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
    const handleAssistantUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { kind?: string; entityType?: string; entityId?: string }
        | undefined;

      if (
        detail?.kind === 'ledger_transaction' &&
        detail.entityType === entityType &&
        detail.entityId === entityId
      ) {
        lastFetchedRef.current = '';
        fetchLedger();
      }
    };

    window.addEventListener(ASSISTANT_DATA_UPDATED_EVENT, handleAssistantUpdate);
    return () => {
      window.removeEventListener(ASSISTANT_DATA_UPDATED_EVENT, handleAssistantUpdate);
    };
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

  // Edit transaction handlers
  const handleEditClick = async (entry: LedgerEntry) => {
    if (!entry.transactionId) {
      toast.error('Unable to locate the transaction for this entry.');
      return;
    }
    setEditLoading(true);
    setEditModalOpen(true);
    
    try {
      const response = await fetch(`/api/transactions/${entry.transactionId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load transaction');
      }
      const data = await response.json();
      const tx = data.transaction;
      setEditingTransaction({
        id: entry.transactionId,
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
      console.error('Failed to load transaction', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load transaction');
      setEditModalOpen(false);
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditModalClose = () => {
    setEditModalOpen(false);
    setEditingTransaction(null);
  };

  const handleEditSave = async () => {
    if (!editingTransaction) return;
    if (editingTransaction.amount === '' || editingTransaction.amount <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    
    setEditSaving(true);
    try {
      const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: editingTransaction.entityType,
          entityId: editingTransaction.entityId,
          type: editingTransaction.type,
          amount: editingTransaction.amount,
          description: editingTransaction.description,
          date: editingTransaction.date,
          billUrl: editingTransaction.billUrl || '',
          billPublicId: editingTransaction.billPublicId || '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update transaction');
      }

      toast.success('Transaction updated successfully');
      handleEditModalClose();
      // Refresh ledger data
      lastFetchedRef.current = '';
      fetchLedger();
    } catch (error) {
      console.error('Failed to update transaction', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update transaction');
    } finally {
      setEditSaving(false);
    }
  };

  // Delete transaction handlers
  const handleDeleteClick = (entry: LedgerEntry) => {
    if (!entry.transactionId) {
      toast.error('Unable to locate the transaction for this entry.');
      return;
    }
    setDeletingTransactionId(entry.transactionId);
    setDeleteModalOpen(true);
  };

  const handleDeleteModalClose = () => {
    setDeleteModalOpen(false);
    setDeletingTransactionId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTransactionId) return;
    
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/transactions/${deletingTransactionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete transaction');
      }

      toast.success('Transaction deleted successfully');
      handleDeleteModalClose();
      // Refresh ledger data
      lastFetchedRef.current = '';
      fetchLedger();
    } catch (error) {
      console.error('Failed to delete transaction', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete transaction');
    } finally {
      setDeleteLoading(false);
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

    setBillModalUploading(true);

    try {
      let fileToUpload = file;

      if (file.size > MAX_BILL_SIZE_BYTES && isCompressibleImage(file)) {
        toast.loading('Compressing image...', { id: 'compress' });
        const compressionResult = await compressImage(file, MAX_BILL_SIZE_BYTES);
        toast.dismiss('compress');
        
        if (compressionResult.wasCompressed) {
          fileToUpload = compressionResult.file;
          toast.success(
            `Image compressed: ${formatFileSize(compressionResult.originalSize)} → ${formatFileSize(compressionResult.compressedSize)}`
          );
        }
      } else if (file.size > MAX_BILL_SIZE_BYTES) {
        toast.error('PDF and HEIC files must be under 5MB. Please reduce the file size manually.');
        event.target.value = '';
        setBillModalUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);

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

  // Opening balance edit handlers
  const handleOpeningBalanceEdit = () => {
    if (!ledgerData) return;
    setOpeningBalanceEditData({
      amount: ledgerData.openingBalance.amount,
      balanceType: ledgerData.openingBalance.type,
      description: ledgerData.openingBalance.description || '',
      billUrl: ledgerData.openingBalance.billUrl || '',
      billPublicId: ledgerData.openingBalance.billPublicId || '',
    });
    setOpeningBalanceModalOpen(true);
  };

  const handleOpeningBalanceModalClose = () => {
    setOpeningBalanceModalOpen(false);
    setOpeningBalanceEditData(null);
  };

  const handleOpeningBalanceBillUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.');
      event.target.value = '';
      return;
    }

    setOpeningBalanceUploading(true);

    try {
      let fileToUpload = file;

      if (file.size > MAX_BILL_SIZE_BYTES && isCompressibleImage(file)) {
        toast.loading('Compressing image...', { id: 'compress' });
        const compressionResult = await compressImage(file, MAX_BILL_SIZE_BYTES);
        toast.dismiss('compress');
        
        if (compressionResult.wasCompressed) {
          fileToUpload = compressionResult.file;
          toast.success(
            `Image compressed: ${formatFileSize(compressionResult.originalSize)} → ${formatFileSize(compressionResult.compressedSize)}`
          );
        }
      } else if (file.size > MAX_BILL_SIZE_BYTES) {
        toast.error('PDF and HEIC files must be under 5MB. Please reduce the file size manually.');
        event.target.value = '';
        setOpeningBalanceUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetch('/api/uploads/bill', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload bill');
      }

      const result = await response.json();
      setOpeningBalanceEditData(prev => prev ? {
        ...prev,
        billUrl: result.url,
        billPublicId: result.publicId,
      } : null);
      toast.success('Bill uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload bill', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload bill');
    } finally {
      setOpeningBalanceUploading(false);
      if (openingBalanceFileInputRef.current) {
        openingBalanceFileInputRef.current.value = '';
      }
    }
  };

  const handleOpeningBalanceRemoveBill = () => {
    setOpeningBalanceEditData(prev => prev ? {
      ...prev,
      billUrl: '',
      billPublicId: '',
    } : null);
  };

  const handleOpeningBalanceSave = async () => {
    if (!openingBalanceEditData || !ledgerData) return;
    if (openingBalanceEditData.amount === '') {
      toast.error('Enter an opening balance amount');
      return;
    }

    setOpeningBalanceSaving(true);
    try {
      // Determine the correct API endpoint based on entity type
      let apiUrl = '';
      if (entityType === 'customer') {
        apiUrl = `/api/customers/${entityId}`;
      } else if (entityType === 'supplier') {
        apiUrl = `/api/suppliers/${entityId}`;
      } else {
        apiUrl = `/api/custom-entities/${entityId}`;
      }

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ledgerData.entity.name,
          phone: ledgerData.entity.phone || '',
          email: ledgerData.entity.email || '',
          address: ledgerData.entity.address || '',
          openingBalance: openingBalanceEditData.amount,
          balanceType: openingBalanceEditData.balanceType,
          openingBalanceDescription: openingBalanceEditData.description,
          openingBalanceBillUrl: openingBalanceEditData.billUrl,
          openingBalanceBillPublicId: openingBalanceEditData.billPublicId,
          ...(entityType !== 'customer' && entityType !== 'supplier' ? { collectionType: entityType } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update opening balance');
      }

      toast.success('Opening balance updated successfully');
      handleOpeningBalanceModalClose();
      // Refresh ledger data
      lastFetchedRef.current = '';
      fetchLedger();
    } catch (error) {
      console.error('Failed to update opening balance', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update opening balance');
    } finally {
      setOpeningBalanceSaving(false);
    }
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
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Opening Balance Row */}
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div>Opening Balance</div>
                    {ledgerData?.openingBalance?.description && (
                      <div className="text-xs text-gray-500 mt-1">{ledgerData.openingBalance.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ledgerData?.openingBalance?.billUrl ? (
                      <a
                        href={ledgerData.openingBalance.billUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View Bill
                      </a>
                    ) : (
                      '—'
                    )}
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleOpeningBalanceEdit}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>

                {/* Transaction Entries */}
                {entries.map((entry, index) => {
                  const balanceColor = entry.balance >= 0 ? 'text-green-600' : 'text-red-600';
                  return (
                    <tr key={index} className="transition-colors hover:bg-muted/60">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        {entry.transactionId ? (
                          <div className="flex justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              onClick={() => handleEditClick(entry)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                              onClick={() => handleDeleteClick(entry)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          '—'
                        )}
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
                  <td className="px-6 py-4"></td>
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

        {/* Edit Transaction Dialog */}
        <Dialog open={editModalOpen} onOpenChange={(open) => !open && handleEditModalClose()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Transaction</DialogTitle>
              <DialogDescription>
                Update the transaction details below.
              </DialogDescription>
            </DialogHeader>

            {editLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading transaction...</div>
            ) : editingTransaction ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <Select
                    value={editingTransaction.type}
                    onValueChange={(value: 'credit' | 'debit') => 
                      setEditingTransaction({ ...editingTransaction, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Credit (You owe them)</SelectItem>
                      <SelectItem value="debit">Debit (They owe you)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Amount (₹)</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editingTransaction.amount}
                    onChange={(e) => 
                      setEditingTransaction({ 
                        ...editingTransaction, 
                        amount: parseNumberInput(e.target.value) ?? ''
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <Textarea
                    value={editingTransaction.description}
                    onChange={(e) => 
                      setEditingTransaction({ 
                        ...editingTransaction, 
                        description: e.target.value 
                      })
                    }
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Date</label>
                  <Input
                    type="date"
                    value={editingTransaction.date}
                    onChange={(e) => 
                      setEditingTransaction({ 
                        ...editingTransaction, 
                        date: e.target.value 
                      })
                    }
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleEditModalClose} disabled={editSaving}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditSave} 
                disabled={editLoading || editSaving || !editingTransaction?.amount}
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteModalOpen} onOpenChange={(open) => !open && handleDeleteModalClose()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Transaction</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this transaction? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleDeleteModalClose} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteConfirm} 
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete Transaction'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Opening Balance Edit Modal */}
        <Dialog open={openingBalanceModalOpen} onOpenChange={(open) => !open && handleOpeningBalanceModalClose()}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Opening Balance</DialogTitle>
              <DialogDescription>
                Update the opening balance details for this {params.entityType?.slice(0, -1) ?? 'entity'}.
              </DialogDescription>
            </DialogHeader>

            {openingBalanceEditData ? (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Amount (₹)</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={openingBalanceEditData.amount}
                    onChange={(e) =>
                      setOpeningBalanceEditData({
                        ...openingBalanceEditData,
                        amount: parseNumberInput(e.target.value) ?? '',
                      })
                    }
                    placeholder="Enter amount"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Balance Type</label>
                  <select
                    value={openingBalanceEditData.balanceType}
                    onChange={(e) =>
                      setOpeningBalanceEditData({
                        ...openingBalanceEditData,
                        balanceType: e.target.value as 'credit' | 'debit',
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="debit">They Owe Us (Debit)</option>
                    <option value="credit">We Owe Them (Credit)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Description (Optional)</label>
                <textarea
                  value={openingBalanceEditData.description}
                  onChange={(e) =>
                    setOpeningBalanceEditData({
                      ...openingBalanceEditData,
                      description: e.target.value,
                    })
                  }
                  placeholder="Add a note about this opening balance..."
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Bill Image (Optional)</label>
                {openingBalanceEditData.billUrl ? (
                  <div className="space-y-3">
                    <div className="relative inline-block">
                      <Image
                        src={openingBalanceEditData.billUrl}
                        alt="Opening Balance Bill"
                        width={200}
                        height={150}
                        className="rounded-md object-cover"
                      />
                    </div>
                    <div className="flex gap-2">
                      <label className="cursor-pointer">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={openingBalanceSaving || openingBalanceUploading}
                          asChild
                        >
                          <span>{openingBalanceUploading ? 'Uploading...' : 'Change'}</span>
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleOpeningBalanceBillUpload}
                          disabled={openingBalanceSaving || openingBalanceUploading}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleOpeningBalanceRemoveBill}
                        disabled={openingBalanceSaving || openingBalanceUploading}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">{openingBalanceUploading ? 'Uploading...' : 'Click to upload'}</span>
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleOpeningBalanceBillUpload}
                        disabled={openingBalanceSaving || openingBalanceUploading}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
            ) : null}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleOpeningBalanceModalClose} disabled={openingBalanceSaving}>
                Cancel
              </Button>
              <Button
                onClick={handleOpeningBalanceSave}
                disabled={openingBalanceSaving || openingBalanceEditData?.amount === ''}
              >
                {openingBalanceSaving ? 'Saving...' : 'Save Changes'}
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
