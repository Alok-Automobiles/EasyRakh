'use client';

import { useState, useRef, useMemo, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import EntityCard from '@/components/EntityCard';
import EntityDirectoryHeader from '@/components/EntityDirectoryHeader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Supplier } from '@/lib/types';
import { motion } from 'motion/react'
import { compressImage, isCompressibleImage, formatFileSize } from '@/lib/imageCompression';
import { parseNumberInput } from '@/lib/number-input';
import { Truck } from 'lucide-react';
import { useDebounce } from '@/lib/hooks/useDebounce';

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().min(0, 'Opening balance cannot be negative').default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
  openingBalanceDescription: z.string().optional(),
  openingBalanceBillUrl: z.string().optional(),
  openingBalanceBillPublicId: z.string().optional(),
});

type SupplierForm = z.input<typeof supplierSchema>;

interface BillUploadResult {
  url: string;
  publicId: string;
  resourceType: 'image' | 'raw';
}

export default function SuppliersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<{ id: string; name: string } | null>(null);
  const [billUploadResult, setBillUploadResult] = useState<BillUploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      openingBalance: 0,
      balanceType: 'debit',
      openingBalanceDescription: '',
      openingBalanceBillUrl: '',
      openingBalanceBillPublicId: '',
    },
  });

  const { data, isLoading } = useQuery<{ suppliers: (Supplier & { id: string; totalBalance: number })[] }>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const response = await fetch('/api/suppliers');
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch suppliers');
      return response.json();
    },
  });

  const suppliers = useMemo(() => data?.suppliers ?? [], [data?.suppliers]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const debouncedSearchQuery = useDebounce(searchQuery, 300).trim();
  const normalizedDebouncedSearchQuery = debouncedSearchQuery.toLowerCase();
  const { data: searchData } = useQuery<{
    suppliers: (Supplier & { id: string; totalBalance: number })[];
  }>({
    queryKey: ['suppliers', 'search', debouncedSearchQuery],
    queryFn: async () => {
      const response = await fetch(
        `/api/suppliers?search=${encodeURIComponent(debouncedSearchQuery)}`
      );
      if (!response.ok) throw new Error('Failed to search suppliers');
      return response.json();
    },
    enabled: debouncedSearchQuery.length >= 2,
  });
  const filteredSuppliers = useMemo(() => {
    if (!normalizedSearchQuery) return suppliers;
    if (
      normalizedSearchQuery.length >= 2 &&
      normalizedSearchQuery === normalizedDebouncedSearchQuery &&
      searchData
    ) {
      return searchData.suppliers;
    }

    return suppliers.filter((supplier) =>
      [supplier.name, supplier.phone, supplier.email, supplier.address].some((value) =>
        (value || '').toLowerCase().includes(normalizedSearchQuery)
      )
    );
  }, [normalizedDebouncedSearchQuery, normalizedSearchQuery, searchData, suppliers]);
  const supplierBalances = useMemo(() => suppliers.reduce(
    (totals, supplier) => ({
      receivable: totals.receivable + Math.max(supplier.totalBalance, 0),
      payable: totals.payable + Math.abs(Math.min(supplier.totalBalance, 0)),
    }),
    { receivable: 0, payable: 0 }
  ), [suppliers]);

  const handleBillUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.');
      event.target.value = '';
      return;
    }

    setIsUploading(true);

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
        setIsUploading(false);
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
      setBillUploadResult({
        url: result.url,
        publicId: result.publicId,
        resourceType: result.resourceType,
      });
      form.setValue('openingBalanceBillUrl', result.url);
      form.setValue('openingBalanceBillPublicId', result.publicId);
      toast.success('Bill uploaded successfully!');
    } catch (error) {
      console.error('Failed to upload bill', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload bill');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveBill = () => {
    setBillUploadResult(null);
    form.setValue('openingBalanceBillUrl', '');
    form.setValue('openingBalanceBillPublicId', '');
  };

  const saveMutation = useMutation({
    mutationFn: async (formData: SupplierForm & { id?: string }) => {
      const url = formData.id ? `/api/suppliers/${formData.id}` : '/api/suppliers';
      const method = formData.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save supplier');
      }
      return response.json();
    },
    onSuccess: (result, variables) => {
      toast.success(variables.id ? 'Supplier updated successfully!' : 'Supplier created successfully!');
      setIsModalOpen(false);
      form.reset();
      setEditingSupplier(null);
      setBillUploadResult(null);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      if (!variables.id && result.supplier?.id) {
        router.push(`/ledger/supplier/${result.supplier.id}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'An error occurred. Please try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete supplier');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Supplier deleted successfully!');
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'An error occurred. Please try again.');
    },
  });

  const onSubmit = (data: SupplierForm) => {
    saveMutation.mutate({ ...data, id: editingSupplier || undefined });
  };

  const openDeleteDialog = (id: string) => {
    const supplier = suppliers.find((s: Supplier & { id: string }) => s.id === id);
    if (supplier) {
      setDeletingSupplier({ id: supplier.id, name: supplier.name });
      setDeleteDialogOpen(true);
    }
  };

  const handleDelete = () => {
    if (!deletingSupplier) return;
    deleteMutation.mutate(deletingSupplier.id);
  };

  const handleEdit = (supplier: Supplier & { id: string }) => {
    setEditingSupplier(supplier.id);
    form.reset({
      name: supplier.name,
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      openingBalance: supplier.openingBalance,
      balanceType: supplier.balanceType,
      openingBalanceDescription: supplier.openingBalanceDescription || '',
      openingBalanceBillUrl: supplier.openingBalanceBillUrl || '',
      openingBalanceBillPublicId: supplier.openingBalanceBillPublicId || '',
    });
    if (supplier.openingBalanceBillUrl) {
      setBillUploadResult({
        url: supplier.openingBalanceBillUrl,
        publicId: supplier.openingBalanceBillPublicId || '',
        resourceType: supplier.openingBalanceBillUrl.includes('/raw/') ? 'raw' : 'image',
      });
    } else {
      setBillUploadResult(null);
    }
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.3 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-9 w-48 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
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
      transition={{ duration: 1.3 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <EntityDirectoryHeader
          title="Suppliers"
          description="Keep supplier accounts, payment details, and balances in one place."
          singularLabel="Supplier"
          count={suppliers.length}
          receivable={supplierBalances.receivable}
          payable={supplierBalances.payable}
          icon={<Truck className="h-5 w-5" />}
          searchQuery={searchQuery}
          searchPlaceholder="Search suppliers by name, phone, email or address"
          resultCount={normalizedSearchQuery ? filteredSuppliers.length : undefined}
          onSearchChange={setSearchQuery}
          onAdd={() => {
              form.reset();
              setEditingSupplier(null);
              setBillUploadResult(null);
              setIsModalOpen(true);
          }}
        />

        <div className="mt-6">
        {suppliers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <p className="text-muted-foreground text-lg">No suppliers yet.</p>
            <p className="text-muted-foreground mt-2">Add your first supplier to get started.</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <p className="text-muted-foreground text-lg">No suppliers match your search.</p>
            <p className="text-muted-foreground mt-2">Try another name, phone, email, or address.</p>
          </div>
        ) : (
          <div className="space-y-3 sm:divide-y sm:divide-border sm:space-y-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:bg-card">
            {filteredSuppliers.map((supplier) => (
              <EntityCard
                key={supplier.id}
                entity={{
                  id: supplier.id,
                  name: supplier.name,
                  phone: supplier.phone,
                  email: supplier.email,
                  address: supplier.address,
                  totalBalance: supplier.totalBalance,
                }}
                entityType="supplier"
                onEdit={() => handleEdit(supplier)}
                onDelete={openDeleteDialog}
              />
            ))}
          </div>
        )}
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
              <DialogDescription>
                {editingSupplier ? 'Update supplier information' : 'Create a new supplier'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="text" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="openingBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opening Balance</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="balanceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Balance Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select balance type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="debit">Debit (They owe you)</SelectItem>
                          <SelectItem value="credit">Credit (You owe them)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Opening Balance Transaction Details */}
                {(form.watch('openingBalance') ?? 0) > 0 && (
                  <>
                    <FormField
                      control={form.control}
                      name="openingBalanceDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opening Balance Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              rows={2} 
                              placeholder="Add a note for the opening balance transaction..."
                              {...field} 
                              value={field.value || ''} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="space-y-2">
                      <FormLabel>Opening Balance Bill/Receipt</FormLabel>
                      {billUploadResult ? (
                        <div className="border rounded-lg p-3 bg-muted/50">
                          <div className="flex items-center gap-3">
                            {billUploadResult.resourceType === 'image' ? (
                              <div className="relative w-16 h-16 rounded overflow-hidden shrink-0">
                                <Image
                                  src={billUploadResult.url}
                                  alt="Bill"
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded bg-muted flex items-center justify-center shrink-0">
                                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">Bill attached</p>
                              <p className="text-xs text-muted-foreground">
                                {billUploadResult.resourceType === 'image' ? 'Image' : 'PDF'}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveBill}
                              className="text-destructive hover:text-destructive"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
                            onChange={handleBillUpload}
                            className="hidden"
                            id="bill-upload"
                          />
                          <label htmlFor="bill-upload">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              disabled={isUploading}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              {isUploading ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  Attach Bill/Receipt (Optional)
                                </>
                              )}
                            </Button>
                          </label>
                          <p className="text-xs text-muted-foreground mt-1">
                            JPG, PNG, WEBP, HEIC, or PDF (max 5MB)
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsModalOpen(false);
                      form.reset();
                      setEditingSupplier(null);
                      setBillUploadResult(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending || isUploading}>
                    {saveMutation.isPending ? 'Saving...' : editingSupplier ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Supplier</DialogTitle>
              <DialogDescription asChild>
                <div className="pt-2 space-y-2 text-sm text-muted-foreground">
                  <p>
                    Are you sure you want to delete <span className="font-semibold">{deletingSupplier?.name}</span>?
                  </p>
                  <p className="text-destructive font-medium">
                    This will permanently delete the supplier and ALL associated transactions. This action cannot be undone and your data will be lost forever.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDeletingSupplier(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
              >
                Delete Permanently
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}
