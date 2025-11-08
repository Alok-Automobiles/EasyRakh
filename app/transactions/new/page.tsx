'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Customer, Supplier } from '@/lib/types';
import Modal from '@/components/Modal';

const transactionSchema = z.object({
  entityType: z.enum(['customer', 'supplier']),
  entityId: z.string().min(1, 'Entity is required'),
  type: z.enum(['credit', 'debit']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  date: z.string().min(1, 'Date is required'),
});

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

type TransactionForm = z.infer<typeof transactionSchema>;
type CustomerForm = z.infer<typeof customerSchema>;
type SupplierForm = z.infer<typeof supplierSchema>;

export default function NewTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [entityType, setEntityType] = useState<'customer' | 'supplier' | null>(null);
  const [customers, setCustomers] = useState<(Customer & { id: string })[]>([]);
  const [suppliers, setSuppliers] = useState<(Supplier & { id: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingEntity, setCreatingEntity] = useState(false);

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

  useEffect(() => {
    fetchCustomers();
    fetchSuppliers();
  }, []);

  // Check for entityType and entityId in query params (from ledger page)
  useEffect(() => {
    const urlEntityType = searchParams.get('entityType') as 'customer' | 'supplier' | null;
    const urlEntityId = searchParams.get('entityId');

    if (urlEntityType && urlEntityId && (urlEntityType === 'customer' || urlEntityType === 'supplier')) {
      // Skip selection step and go directly to form
      setEntityType(urlEntityType);
      setValue('entityType', urlEntityType);
      setValue('entityId', urlEntityId);
      setStep('form');
    }
  }, [searchParams, setValue]);

  // Ensure entityId is set after entities are loaded (for pre-selection in dropdown)
  useEffect(() => {
    const urlEntityType = searchParams.get('entityType') as 'customer' | 'supplier' | null;
    const urlEntityId = searchParams.get('entityId');

    if (urlEntityType && urlEntityId && (urlEntityType === 'customer' || urlEntityType === 'supplier')) {
      const entities = urlEntityType === 'customer' ? customers : suppliers;
      // If entities are loaded and the entityId exists in the list, ensure it's set
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
      toast.error('Failed to fetch suppliers');
    }
  };

  const handleEntityTypeSelect = (type: 'customer' | 'supplier') => {
    setEntityType(type);
    setValue('entityType', type);
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
      toast.error('An error occurred. Please try again.');
    } finally {
      setCreatingEntity(false);
    }
  };

  const onSubmit = async (data: TransactionForm) => {
    setLoading(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success('Transaction created successfully!');
        reset();
        
        // If we came from a ledger page, redirect back to it
        const urlEntityType = searchParams.get('entityType');
        const urlEntityId = searchParams.get('entityId');
        
        if (urlEntityType && urlEntityId && (urlEntityType === 'customer' || urlEntityType === 'supplier')) {
          router.push(`/ledger/${urlEntityType}/${urlEntityId}`);
        } else {
          router.push('/');
        }
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to create transaction');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'select') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">New Transaction</h1>
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Select Transaction Type
          </h2>
          <div className="space-y-4">
            <button
              onClick={() => handleEntityTypeSelect('customer')}
              className="w-full p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Customer</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Transaction with a customer
                  </p>
                </div>
                <span className="text-2xl">→</span>
              </div>
            </button>
            <button
              onClick={() => handleEntityTypeSelect('supplier')}
              className="w-full p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Supplier</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Transaction with a supplier
                  </p>
                </div>
                <span className="text-2xl">→</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const entities = entityType === 'customer' ? customers : suppliers;
  const entityName = entityType === 'customer' ? 'Customer' : 'Supplier';
  
  // Check if we came from a ledger page
  const urlEntityType = searchParams.get('entityType');
  const urlEntityId = searchParams.get('entityId');
  const cameFromLedger = urlEntityType && urlEntityId && (urlEntityType === 'customer' || urlEntityType === 'supplier');

  return (
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
          <button
            onClick={() => {
              setStep('select');
              setEntityType(null);
              reset();
            }}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Back to Selection
          </button>
        )}
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">New Transaction</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">
              {entityName} *
            </label>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Create New {entityName}
            </button>
          </div>
          <select
            {...register('entityId')}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          >
            <option value="">Select a {entityName.toLowerCase()}</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
          {errors.entityId && (
            <p className="mt-1 text-sm text-red-600">{errors.entityId.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transaction Type *
          </label>
          <select
            {...register('type')}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          >
            <option value="debit">Debit (Money received)</option>
            <option value="credit">Credit (Money given)</option>
          </select>
          {errors.type && (
            <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount *
          </label>
          <input
            {...register('amount', { valueAsNumber: true })}
            type="number"
            step="0.01"
            min="0.01"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
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
          <textarea
            {...register('description')}
            rows={3}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            placeholder="Transaction description (optional)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date *
          </label>
          <input
            {...register('date')}
            type="date"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
          />
          {errors.date && (
            <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Transaction'}
          </button>
        </div>
      </form>

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCustomer();
          resetSupplier();
        }}
        title={`Create New ${entityName}`}
      >
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
        ) : (
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
        )}
      </Modal>
    </div>
  );
}
