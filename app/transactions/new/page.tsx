'use client';

import { useState, useEffect, useRef, Suspense, ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Customer, Supplier, CustomEntity, CollectionType } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { motion } from 'motion/react'

const transactionSchema = z.object({
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.string().min(1, 'Entity is required'),
  type: z.enum(['credit', 'debit']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
  billUrl: z.string().optional(),
  billPublicId: z.string().optional(),
});

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

const customEntitySchema = z.object({
  collectionType: z.string().min(1, 'Collection type is required'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

type TransactionForm = z.infer<typeof transactionSchema>;
type CustomerForm = z.infer<typeof customerSchema>;
type SupplierForm = z.infer<typeof supplierSchema>;
type CustomEntityForm = z.infer<typeof customEntitySchema>;

function NewTransactionPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [entityType, setEntityType] = useState<string | null>(null);
  const [customers, setCustomers] = useState<(Customer & { id: string })[]>([]);
  const [suppliers, setSuppliers] = useState<(Supplier & { id: string })[]>([]);
  const [customEntities, setCustomEntities] = useState<(CustomEntity & { id: string })[]>([]);
  const [collectionTypes, setCollectionTypes] = useState<(CollectionType & { id: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingEntity, setCreatingEntity] = useState(false);
  const hasFetchedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [billUploadResult, setBillUploadResult] = useState<{
    url: string;
    publicId: string;
    resourceType: string;
  } | null>(null);
  const [billUploading, setBillUploading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'debit',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const {
    register: registerCustomer,
    handleSubmit: handleSubmitCustomer,
    reset: resetCustomer,
    formState: { errors: customerErrors },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  const {
    register: registerSupplier,
    handleSubmit: handleSubmitSupplier,
    reset: resetSupplier,
    formState: { errors: supplierErrors },
  } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  const {
    register: registerCustomEntity,
    handleSubmit: handleSubmitCustomEntity,
    reset: resetCustomEntity,
    formState: { errors: customEntityErrors },
  } = useForm<CustomEntityForm>({
    resolver: zodResolver(customEntitySchema),
    defaultValues: {
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchCustomers();
    fetchSuppliers();
    fetchCollectionTypes();
  }, []);

  const fetchCollectionTypes = async () => {
    try {
      const response = await fetch('/api/collection-types');
      if (response.ok) {
        const data = await response.json();
        setCollectionTypes(data.collectionTypes || []);
      }
    } catch (error) {
      console.error('Failed to fetch collection types', error);
    }
  };

  const fetchCustomEntities = async (collectionType: string) => {
    try {
      const response = await fetch(`/api/custom-entities?collectionType=${collectionType}`);
      if (response.ok) {
        const data = await response.json();
        setCustomEntities(data.entities || []);
      }
    } catch (error) {
      console.error('Failed to fetch custom entities', error);
    }
  };

  useEffect(() => {
    const urlEntityType = searchParams.get('entityType');
    const urlEntityId = searchParams.get('entityId');

    if (urlEntityType && urlEntityId) {
      setEntityType(urlEntityType);
      setValue('entityType', urlEntityType);
      if (urlEntityType !== 'customer' && urlEntityType !== 'supplier') {
        fetchCustomEntities(urlEntityType);
      }
      setValue('entityId', urlEntityId);
      setStep('form');
    }
  }, [searchParams, setValue]);

  useEffect(() => {
    const urlEntityType = searchParams.get('entityType') as 'customer' | 'supplier' | null;
    const urlEntityId = searchParams.get('entityId');

    if (urlEntityType && urlEntityId && (urlEntityType === 'customer' || urlEntityType === 'supplier')) {
      const entities = urlEntityType === 'customer' ? customers : suppliers;
      if (entities.length > 0 && entities.some(e => e.id === urlEntityId)) {
        setValue('entityId', urlEntityId);
      }
    }
  }, [customers, suppliers, searchParams, setValue]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Failed to fetch customers', error);
      toast.error('Failed to fetch customers');
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers');
      if (response.ok) {
        const data = await response.json();
        setSuppliers(data.suppliers || []);
      }
    } catch (error) {
      console.error('Failed to fetch suppliers', error);
      toast.error('Failed to fetch suppliers');
    }
  };

  const handleBillFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_BILL_SIZE_BYTES) {
      toast.error('File size exceeds 5MB limit.');
      event.target.value = '';
      return;
    }

    setBillUploading(true);
    setBillUploadResult(null);

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
      setBillUploadResult(result);
      toast.success('Bill uploaded successfully.');
    } catch (error) {
      console.error('Failed to upload bill', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload bill');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setBillUploading(false);
    }
  };

  const handleRemoveBill = () => {
    setBillUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEntityTypeSelect = (type: string) => {
    setEntityType(type);
    setValue('entityType', type);
    if (type !== 'customer' && type !== 'supplier') {
      fetchCustomEntities(type);
    }
    setStep('form');
  };

  const handleCreateCustomer = async (data: CustomerForm) => {
    setCreatingEntity(true);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Customer created successfully!');
        setValue('entityId', result.customer.id);
        setShowCreateModal(false);
        resetCustomer();
        fetchCustomers();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to create customer');
      }
    } catch (error) {
      console.error('Failed to create customer', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setCreatingEntity(false);
    }
  };

  const handleCreateSupplier = async (data: SupplierForm) => {
    setCreatingEntity(true);
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Supplier created successfully!');
        setValue('entityId', result.supplier.id);
        setShowCreateModal(false);
        resetSupplier();
        fetchSuppliers();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to create supplier');
      }
    } catch (error) {
      console.error('Failed to create supplier', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setCreatingEntity(false);
    }
  };

  const handleCreateCustomEntity = async (data: CustomEntityForm) => {
    setCreatingEntity(true);
    try {
      const response = await fetch('/api/custom-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Entity created successfully!');
        setValue('entityId', result.entity.id);
        setShowCreateModal(false);
        resetCustomEntity();
        if (entityType) {
          fetchCustomEntities(entityType);
        }
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to create entity');
      }
    } catch (error) {
      console.error('Failed to create custom entity', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setCreatingEntity(false);
    }
  };

  const onSubmit = async (data: TransactionForm) => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { ...data };

      if (billUploadResult) {
        payload.billUrl = billUploadResult.url;
        payload.billPublicId = billUploadResult.publicId;
      } else {
        delete payload.billUrl;
        delete payload.billPublicId;
      }

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success('Transaction created successfully!');
        reset();
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setBillUploadResult(null);

        const ledgerEntityType = data.entityType || searchParams.get('entityType');
        const ledgerEntityId = data.entityId || searchParams.get('entityId');

        if (ledgerEntityType && ledgerEntityId) {
          router.push(`/ledger/${ledgerEntityType}/${ledgerEntityId}`);
        } else {
          router.push('/');
        }
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to create transaction');
      }
    } catch (error) {
      console.error('Failed to create transaction', error);
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'select') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.3 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">New Transaction</h1>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Select Transaction Type
            </h2>
            <div className="space-y-4">
              <Button
                onClick={() => handleEntityTypeSelect('customer')}
                variant="outline"
                className="w-full p-6 h-auto justify-start"
              >
                <div className="flex items-center justify-between w-full">
                  <div>
                    <h3 className="text-lg font-semibold">Customer</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Transaction with a customer
                    </p>
                  </div>
                  <span className="text-2xl">→</span>
                </div>
              </Button>
              <Button
                onClick={() => handleEntityTypeSelect('supplier')}
                variant="outline"
                className="w-full p-6 h-auto justify-start"
              >
                <div className="flex items-center justify-between w-full">
                  <div>
                    <h3 className="text-lg font-semibold">Supplier</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Transaction with a supplier
                    </p>
                  </div>
                  <span className="text-2xl">→</span>
                </div>
              </Button>
              {collectionTypes.map((ct) => (
                <Button
                  key={ct.id}
                  onClick={() => handleEntityTypeSelect(ct.slug)}
                  variant="outline"
                  className="w-full p-6 h-auto justify-start"
                >
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <h3 className="text-lg font-semibold">{ct.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Transaction with {ct.name.toLowerCase()}
                      </p>
                    </div>
                    <span className="text-2xl">→</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const entities = entityType === 'customer'
    ? customers
    : entityType === 'supplier'
      ? suppliers
      : customEntities;

  const collectionType = collectionTypes.find(ct => ct.slug === entityType);
  const entityName = entityType === 'customer'
    ? 'Customer'
    : entityType === 'supplier'
      ? 'Supplier'
      : collectionType?.name || 'Entity';

  const urlEntityType = searchParams.get('entityType');
  const urlEntityId = searchParams.get('entityId');
  const cameFromLedger = urlEntityType && urlEntityId;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.3 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4">
          {cameFromLedger ? (
            <Link
              href={`/ledger/${urlEntityType}/${urlEntityId}`}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Back to Ledger
            </Link>
          ) : (
            <Button
              onClick={() => {
                setStep('select');
                setEntityType(null);
                reset();
              }}
              variant="link"
              size="sm"
            >
              ← Back to Selection
            </Button>
          )}
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">New Transaction</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-md p-6 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {entityName} *
              </label>
              <Button
                type="button"
                onClick={() => setShowCreateModal(true)}
                variant="link"
                size="sm"
              >
                + Create New {entityName}
              </Button>
            </div>
            <Select
              onValueChange={(value) => setValue('entityId', value)}
              defaultValue={watch('entityId')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Select a ${entityName.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {entities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id}>
                    {entity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.entityId && (
              <p className="mt-1 text-sm text-red-600">{errors.entityId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transaction Type *
            </label>
            <Select
              onValueChange={(value) => setValue('type', value as 'credit' | 'debit')}
              defaultValue={watch('type')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select transaction type" />
              </SelectTrigger>
              <SelectContent>
                {entityType === 'supplier' ? (
                  <>
                    <SelectItem value="credit">Credit (Parts supplied by supplier)</SelectItem>
                    <SelectItem value="debit">Debit (Money paid to supplier)</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="debit">Debit (Customer purchase - amount to be paid)</SelectItem>
                    <SelectItem value="credit">Credit (Money received from customer)</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount *
            </label>
            <Input
              {...register('amount', { valueAsNumber: true })}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <Textarea
              {...register('description')}
              rows={3}
              placeholder="Transaction description (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date *
            </label>
            <Input
              {...register('date')}
              type="date"
            />
            {errors.date && (
              <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bill Attachment
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              className="hidden"
              onChange={handleBillFileChange}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={billUploading}
              >
                {billUploadResult ? 'Replace Bill' : 'Upload Bill'}
              </Button>
              {billUploadResult && (
                <Button type="button" variant="ghost" onClick={handleRemoveBill} disabled={billUploading}>
                  Remove
                </Button>
              )}
            </div>
            {billUploading && (
              <p className="text-sm text-muted-foreground mt-2">Uploading bill...</p>
            )}
            {billUploadResult && (
              <div className="mt-3 flex items-center gap-3">
                {billUploadResult.resourceType === 'image' ? (
                  <Image
                    src={billUploadResult.url}
                    alt="Bill preview"
                    width={80}
                    height={80}
                    unoptimized
                    className="h-20 w-20 rounded-md object-cover border"
                  />
                ) : (
                  <div className="text-sm text-gray-600">PDF uploaded</div>
                )}
                <a
                  href={billUploadResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View uploaded file
                </a>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Accepted formats: JPG, PNG, WEBP, HEIC/HEIF, PDF up to 5MB.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              onClick={() => router.back()}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || billUploading}
            >
              {loading ? 'Creating...' : 'Create Transaction'}
            </Button>
          </div>
        </form>

        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New {entityName}</DialogTitle>
              <DialogDescription>
                Add a new {entityName.toLowerCase()} to your ledger
              </DialogDescription>
            </DialogHeader>
            {entityType === 'customer' ? (
              <form onSubmit={handleSubmitCustomer(handleCreateCustomer)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    {...registerCustomer('name')}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                  {customerErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{customerErrors.name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    {...registerCustomer('phone')}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    {...registerCustomer('email')}
                    type="email"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <textarea
                    {...registerCustomer('address')}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Opening Balance</label>
                  <input
                    {...registerCustomer('openingBalance', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Balance Type</label>
                  <select
                    {...registerCustomer('balanceType')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  >
                    <option value="debit">Debit (They owe you)</option>
                    <option value="credit">Credit (You owe them)</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCustomer();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingEntity}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingEntity ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            ) : entityType === 'supplier' ? (
              <form onSubmit={handleSubmitSupplier(handleCreateSupplier)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    {...registerSupplier('name')}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                  {supplierErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{supplierErrors.name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    {...registerSupplier('phone')}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    {...registerSupplier('email')}
                    type="email"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <textarea
                    {...registerSupplier('address')}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Opening Balance</label>
                  <input
                    {...registerSupplier('openingBalance', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Balance Type</label>
                  <select
                    {...registerSupplier('balanceType')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  >
                    <option value="debit">Debit (They owe you)</option>
                    <option value="credit">Credit (You owe them)</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetSupplier();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingEntity}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingEntity ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmitCustomEntity(handleCreateCustomEntity)} className="space-y-4">
                <input type="hidden" {...registerCustomEntity('collectionType')} value={entityType || ''} />
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    {...registerCustomEntity('name')}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                  {customEntityErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{customEntityErrors.name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    {...registerCustomEntity('phone')}
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    {...registerCustomEntity('email')}
                    type="email"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <textarea
                    {...registerCustomEntity('address')}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Opening Balance</label>
                  <input
                    {...registerCustomEntity('openingBalance', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Balance Type</label>
                  <select
                    {...registerCustomEntity('balanceType')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  >
                    <option value="debit">Debit (They owe you)</option>
                    <option value="credit">Credit (You owe them)</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCustomEntity();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingEntity}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingEntity ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}

export default function NewTransactionPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <NewTransactionPageContent />
    </Suspense>
  );
}
