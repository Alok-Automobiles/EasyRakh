'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import SupplierCard from '@/components/SupplierCard';
import Modal from '@/components/Modal';
import { Supplier } from '@/lib/types';

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

type SupplierForm = z.infer<typeof supplierSchema>;

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<(Supplier & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers');
      if (response.ok) {
        const data = await response.json();
        setSuppliers(data.suppliers);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      toast.error('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: SupplierForm) => {
    try {
      const url = editingSupplier
        ? `/api/suppliers/${editingSupplier}`
        : '/api/suppliers';
      const method = editingSupplier ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success(
          editingSupplier
            ? 'Supplier updated successfully!'
            : 'Supplier created successfully!'
        );
        setIsModalOpen(false);
        reset();
        setEditingSupplier(null);
        fetchSuppliers();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to save supplier');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) {
      return;
    }

    try {
      const response = await fetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Supplier deleted successfully!');
        fetchSuppliers();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to delete supplier');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleEdit = (supplier: Supplier & { id: string }) => {
    setEditingSupplier(supplier.id);
    reset({
      name: supplier.name,
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      openingBalance: supplier.openingBalance,
      balanceType: supplier.balanceType,
    });
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Suppliers</h1>
        <button
          onClick={() => {
            reset();
            setEditingSupplier(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
        >
          Add Supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No suppliers yet.</p>
          <p className="text-gray-400 mt-2">Add your first supplier to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="relative">
              <SupplierCard
                supplier={supplier}
                onDelete={handleDelete}
              />
              <button
                onClick={() => handleEdit(supplier)}
                className="absolute top-2 right-2 text-blue-500 hover:text-blue-700 text-sm font-medium"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          reset();
          setEditingSupplier(null);
        }}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              {...register('name')}
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              {...register('phone')}
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Address
            </label>
            <textarea
              {...register('address')}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Opening Balance
            </label>
            <input
              {...register('openingBalance', { valueAsNumber: true })}
              type="number"
              step="0.01"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Balance Type
            </label>
            <select
              {...register('balanceType')}
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
                setIsModalOpen(false);
                reset();
                setEditingSupplier(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              {editingSupplier ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

