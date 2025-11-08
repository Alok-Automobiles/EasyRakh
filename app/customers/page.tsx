'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import CustomerCard from '@/components/CustomerCard';
import Modal from '@/components/Modal';
import { Customer } from '@/lib/types';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

type CustomerForm = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<(Customer & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      toast.error('Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CustomerForm) => {
    try {
      const url = editingCustomer
        ? `/api/customers/${editingCustomer}`
        : '/api/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success(
          editingCustomer
            ? 'Customer updated successfully!'
            : 'Customer created successfully!'
        );
        setIsModalOpen(false);
        reset();
        setEditingCustomer(null);
        fetchCustomers();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to save customer');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) {
      return;
    }

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Customer deleted successfully!');
        fetchCustomers();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to delete customer');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleEdit = (customer: Customer & { id: string }) => {
    setEditingCustomer(customer.id);
    reset({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      openingBalance: customer.openingBalance,
      balanceType: customer.balanceType,
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
        <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
        <button
          onClick={() => {
            reset();
            setEditingCustomer(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
        >
          Add Customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No customers yet.</p>
          <p className="text-gray-400 mt-2">Add your first customer to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((customer) => (
            <div key={customer.id} className="relative">
              <CustomerCard
                customer={customer}
                onDelete={handleDelete}
              />
              <button
                onClick={() => handleEdit(customer)}
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
          setEditingCustomer(null);
        }}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
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
                setEditingCustomer(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              {editingCustomer ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

