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
import { compressImage, isCompressibleImage, formatFileSize } from '@/lib/imageCompression';
import { ACTION_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { focusNextFormFieldAfterSelect, handleEnterToNextFormField } from '@/lib/form-keyboard-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Receipt,
  Users,
  Truck,
  Building2,
  Calendar,
  IndianRupee,
  Upload,
  Plus,
  FileText,
  Wallet,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ImageIcon,
  Trash2,
  Loader2,
} from 'lucide-react';

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

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB - used for compression target
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

type TransactionForm = z.input<typeof transactionSchema>;
type CustomerForm = z.input<typeof customerSchema>;
type SupplierForm = z.input<typeof supplierSchema>;
type CustomEntityForm = z.input<typeof customEntitySchema>;

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
  const entitySelectTriggerRef = useRef<HTMLButtonElement>(null);
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

    setBillUploading(true);
    setBillUploadResult(null);

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
        setBillUploading(false);
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
    const selectionOptions = [
      {
        key: 'customer',
        title: 'Customer',
        description: 'Record a sale or payment received',
        icon: Users,
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        hoverBorder: 'hover:border-blue-300',
        hoverBg: 'group-hover:bg-blue-50',
      },
      {
        key: 'supplier',
        title: 'Supplier',
        description: 'Record stock received or payment made',
        icon: Truck,
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
        hoverBorder: 'hover:border-amber-300',
        hoverBg: 'group-hover:bg-amber-50',
      },
      ...collectionTypes.map((ct) => ({
        key: ct.slug,
        title: ct.name,
        description: `Transaction with ${ct.name.toLowerCase()}`,
        icon: Building2,
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
        hoverBorder: 'hover:border-purple-300',
        hoverBg: 'group-hover:bg-purple-50',
      })),
    ];

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 shadow-sm">
                <Receipt className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  New Transaction
                </h1>
                <p className="text-gray-500 text-sm">
                  Record a credit or debit entry in your ledger
                </p>
              </div>
            </div>
          </div>

          {/* Selection card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Who is this transaction with?
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              Pick the type of counterparty to continue.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectionOptions.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleEntityTypeSelect(opt.key)}
                    className={`group text-left rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md ${opt.hoverBorder} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${opt.iconBg} transition-colors`}>
                        <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {opt.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {opt.description}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </button>
                );
              })}
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

  const headerIconConfig = entityType === 'customer'
    ? { Icon: Users, bg: 'bg-blue-100', color: 'text-blue-600' }
    : entityType === 'supplier'
      ? { Icon: Truck, bg: 'bg-amber-100', color: 'text-amber-600' }
      : { Icon: Building2, bg: 'bg-purple-100', color: 'text-purple-600' };
  const HeaderIcon = headerIconConfig.Icon;

  const currentType = watch('type');
  const currentEntityId = watch('entityId');
  const selectedEntity = entities.find((e) => e.id === currentEntityId);

  const typeOptions = entityType === 'supplier'
    ? [
        {
          value: 'credit' as const,
          label: 'Credit',
          help: 'Parts supplied by supplier',
          Icon: TrendingUp,
          activeRing: 'ring-green-500',
          activeBg: 'bg-green-50',
          activeText: 'text-green-700',
          activeIconBg: 'bg-green-100',
        },
        {
          value: 'debit' as const,
          label: 'Debit',
          help: 'Money paid to supplier',
          Icon: TrendingDown,
          activeRing: 'ring-red-500',
          activeBg: 'bg-red-50',
          activeText: 'text-red-700',
          activeIconBg: 'bg-red-100',
        },
      ]
    : [
        {
          value: 'debit' as const,
          label: 'Debit',
          help: 'Customer owes you (sale on credit)',
          Icon: TrendingDown,
          activeRing: 'ring-red-500',
          activeBg: 'bg-red-50',
          activeText: 'text-red-700',
          activeIconBg: 'bg-red-100',
        },
        {
          value: 'credit' as const,
          label: 'Credit',
          help: 'Payment received from customer',
          Icon: TrendingUp,
          activeRing: 'ring-green-500',
          activeBg: 'bg-green-50',
          activeText: 'text-green-700',
          activeIconBg: 'bg-green-100',
        },
      ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
        {/* Header */}
        <div className="mb-6">
          {cameFromLedger ? (
            <Link
              href={`/ledger/${urlEntityType}/${urlEntityId}`}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Ledger
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStep('select');
                setEntityType(null);
                reset();
              }}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to selection
            </button>
          )}

          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${headerIconConfig.bg} shadow-sm`}>
              <HeaderIcon className={`w-6 h-6 ${headerIconConfig.color}`} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                New {entityName} Transaction
              </h1>
              <p className="text-gray-500 text-sm">
                Add a new entry to the {entityName.toLowerCase()} ledger.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={handleEnterToNextFormField} className="space-y-6">
          {/* Counterparty */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <HeaderIcon className={`w-5 h-5 ${headerIconConfig.color}`} />
                <h2 className="text-lg font-semibold text-gray-900">
                  {entityName}
                </h2>
              </div>
              <Button
                type="button"
                onClick={() => setShowCreateModal(true)}
                variant="outline"
                size="sm"
                data-shortcut-action="new"
                data-app-shortcut={ACTION_SHORTCUTS.primary.display}
                aria-keyshortcuts={ACTION_SHORTCUTS.primary.aria}
              >
                <Plus className="w-4 h-4 mr-1" />
                Create new
              </Button>
            </div>

            <Label htmlFor="entity-select" className="text-sm text-gray-600">
              Select {entityName.toLowerCase()} *
            </Label>
            <Select
              value={currentEntityId || ''}
              onValueChange={(value) => {
                setValue('entityId', value, { shouldValidate: true });
                focusNextFormFieldAfterSelect(entitySelectTriggerRef.current);
              }}
            >
              <SelectTrigger ref={entitySelectTriggerRef} id="entity-select" className="w-full mt-1">
                <SelectValue placeholder={
                  entities.length === 0
                    ? `No ${entityName.toLowerCase()}s yet — create one`
                    : `Choose a ${entityName.toLowerCase()}`
                } />
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
            {selectedEntity && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="font-medium">{selectedEntity.name}</span>
                <span className="text-gray-400">selected</span>
              </div>
            )}
          </div>

          {/* Transaction details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Transaction Details
              </h2>
            </div>

            <div className="space-y-5">
              <div>
                <Label className="text-sm text-gray-600">Type *</Label>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {typeOptions.map((opt) => {
                    const isActive = currentType === opt.value;
                    const Icon = opt.Icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setValue('type', opt.value, { shouldValidate: true })}
                        className={`text-left rounded-xl border p-3 transition-all ${
                          isActive
                            ? `border-transparent ring-2 ${opt.activeRing} ${opt.activeBg}`
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg ${
                              isActive ? opt.activeIconBg : 'bg-gray-100'
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 ${
                                isActive ? opt.activeText : 'text-gray-500'
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-semibold ${
                                isActive ? opt.activeText : 'text-gray-900'
                              }`}
                            >
                              {opt.label}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {opt.help}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.type && (
                  <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount" className="text-sm text-gray-600">
                    Amount *
                  </Label>
                  <div className="relative mt-1">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="amount"
                      {...register('amount', { valueAsNumber: true })}
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      className="pl-9"
                    />
                  </div>
                  {errors.amount && (
                    <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="date" className="text-sm text-gray-600">
                    Date *
                  </Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                      id="date"
                      {...register('date')}
                      type="date"
                      className="pl-9"
                    />
                  </div>
                  {errors.date && (
                    <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Description
              </h2>
              <span className="text-xs text-gray-400">(optional)</span>
            </div>
            <Textarea
              {...register('description')}
              rows={3}
              placeholder="What is this transaction for? e.g. Brake pads order, Cash settlement, etc."
            />
          </div>

          {/* Bill attachment */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Bill Attachment
                </h2>
                <span className="text-xs text-gray-400">(optional)</span>
              </div>
              {billUploadResult && !billUploading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveBill}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Remove
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              className="hidden"
              onChange={handleBillFileChange}
            />

            {!billUploadResult ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={billUploading}
                className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {billUploading ? (
                  <>
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <p className="text-sm font-medium text-gray-700">
                      Uploading bill...
                    </p>
                  </>
                ) : (
                  <>
                    <div className="p-2.5 rounded-full bg-blue-100">
                      <Upload className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">
                      Click to upload a bill
                    </p>
                    <p className="text-xs text-gray-500">
                      JPG, PNG, WEBP, HEIC/HEIF or PDF — large images auto-compressed
                    </p>
                  </>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 bg-gray-50">
                {billUploadResult.resourceType === 'image' ? (
                  <Image
                    src={billUploadResult.url}
                    alt="Bill preview"
                    width={80}
                    height={80}
                    unoptimized
                    className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {billUploadResult.resourceType === 'image' ? 'Image' : 'PDF'} uploaded
                  </p>
                  <a
                    href={billUploadResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View uploaded file
                  </a>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={billUploading}
                >
                  Replace
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
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
              variant="default"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Transaction'
              )}
            </Button>
          </div>
        </form>

        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${headerIconConfig.bg}`}>
                  <HeaderIcon className={`w-4 h-4 ${headerIconConfig.color}`} />
                </div>
                Create New {entityName}
              </DialogTitle>
              <DialogDescription>
                Add a new {entityName.toLowerCase()} to your ledger.
              </DialogDescription>
            </DialogHeader>
            {entityType === 'customer' ? (
              <form onSubmit={handleSubmitCustomer(handleCreateCustomer)} onKeyDown={handleEnterToNextFormField} className="space-y-4">
                <div>
                  <Label htmlFor="customer-name">Name *</Label>
                  <Input
                    id="customer-name"
                    {...registerCustomer('name')}
                    type="text"
                    placeholder="Customer name"
                    className="mt-1"
                  />
                  {customerErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{customerErrors.name.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer-phone">Phone</Label>
                    <Input
                      id="customer-phone"
                      {...registerCustomer('phone')}
                      type="text"
                      placeholder="Phone number"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer-email">Email</Label>
                    <Input
                      id="customer-email"
                      {...registerCustomer('email')}
                      type="email"
                      placeholder="email@example.com"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="customer-address">Address</Label>
                  <Textarea
                    id="customer-address"
                    {...registerCustomer('address')}
                    rows={2}
                    placeholder="Address"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer-opening">Opening Balance</Label>
                    <div className="relative mt-1">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="customer-opening"
                        {...registerCustomer('openingBalance', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        defaultValue={0}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="customer-balance-type">Balance Type</Label>
                    <select
                      id="customer-balance-type"
                      {...registerCustomer('balanceType')}
                      className="mt-1 block w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="debit">Debit (They owe you)</option>
                      <option value="credit">Credit (You owe them)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCustomer();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creatingEntity}
                    variant="default"
                  >
                    {creatingEntity ? 'Creating...' : 'Create Customer'}
                  </Button>
                </div>
              </form>
            ) : entityType === 'supplier' ? (
              <form onSubmit={handleSubmitSupplier(handleCreateSupplier)} onKeyDown={handleEnterToNextFormField} className="space-y-4">
                <div>
                  <Label htmlFor="supplier-name">Name *</Label>
                  <Input
                    id="supplier-name"
                    {...registerSupplier('name')}
                    type="text"
                    placeholder="Supplier name"
                    className="mt-1"
                  />
                  {supplierErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{supplierErrors.name.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier-phone">Phone</Label>
                    <Input
                      id="supplier-phone"
                      {...registerSupplier('phone')}
                      type="text"
                      placeholder="Phone number"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplier-email">Email</Label>
                    <Input
                      id="supplier-email"
                      {...registerSupplier('email')}
                      type="email"
                      placeholder="email@example.com"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="supplier-address">Address</Label>
                  <Textarea
                    id="supplier-address"
                    {...registerSupplier('address')}
                    rows={2}
                    placeholder="Address"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier-opening">Opening Balance</Label>
                    <div className="relative mt-1">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="supplier-opening"
                        {...registerSupplier('openingBalance', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        defaultValue={0}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="supplier-balance-type">Balance Type</Label>
                    <select
                      id="supplier-balance-type"
                      {...registerSupplier('balanceType')}
                      className="mt-1 block w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="debit">Debit (They owe you)</option>
                      <option value="credit">Credit (You owe them)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetSupplier();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creatingEntity}
                    variant="default"
                  >
                    {creatingEntity ? 'Creating...' : 'Create Supplier'}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmitCustomEntity(handleCreateCustomEntity)} onKeyDown={handleEnterToNextFormField} className="space-y-4">
                <input type="hidden" {...registerCustomEntity('collectionType')} value={entityType || ''} />
                <div>
                  <Label htmlFor="entity-name">Name *</Label>
                  <Input
                    id="entity-name"
                    {...registerCustomEntity('name')}
                    type="text"
                    placeholder={`${entityName} name`}
                    className="mt-1"
                  />
                  {customEntityErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{customEntityErrors.name.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="entity-phone">Phone</Label>
                    <Input
                      id="entity-phone"
                      {...registerCustomEntity('phone')}
                      type="text"
                      placeholder="Phone number"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="entity-email">Email</Label>
                    <Input
                      id="entity-email"
                      {...registerCustomEntity('email')}
                      type="email"
                      placeholder="email@example.com"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="entity-address">Address</Label>
                  <Textarea
                    id="entity-address"
                    {...registerCustomEntity('address')}
                    rows={2}
                    placeholder="Address"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="entity-opening">Opening Balance</Label>
                    <div className="relative mt-1">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="entity-opening"
                        {...registerCustomEntity('openingBalance', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        defaultValue={0}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="entity-balance-type">Balance Type</Label>
                    <select
                      id="entity-balance-type"
                      {...registerCustomEntity('balanceType')}
                      className="mt-1 block w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="debit">Debit (They owe you)</option>
                      <option value="credit">Credit (You owe them)</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCustomEntity();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creatingEntity}
                    variant="default"
                  >
                    {creatingEntity ? 'Creating...' : `Create ${entityName}`}
                  </Button>
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
