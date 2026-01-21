'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import EntityCard from '@/components/EntityCard';
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
import { Customer } from '@/lib/types';
import { motion } from 'motion/react'

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
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  // React Query for fetching customers - cached across navigation
  const { data, isLoading, error } = useQuery<{ customers: (Customer & { id: string; totalBalance: number })[] }>({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await fetch('/api/customers');
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    },
  });

  const customers = data?.customers ?? [];

  // Mutation for creating/updating customers
  const saveMutation = useMutation({
    mutationFn: async (formData: CustomerForm & { id?: string }) => {
      const url = formData.id ? `/api/customers/${formData.id}` : '/api/customers';
      const method = formData.id ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to save customer');
      }
      return response.json();
    },
    onSuccess: (result, variables) => {
      toast.success(variables.id ? 'Customer updated successfully!' : 'Customer created successfully!');
      setIsModalOpen(false);
      form.reset();
      setEditingCustomer(null);
      // Invalidate cache to refetch
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      if (!variables.id && result.customer?.id) {
        router.push(`/ledger/customer/${result.customer.id}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'An error occurred. Please try again.');
    },
  });

  // Mutation for deleting customers
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete customer');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Customer deleted successfully!');
      setDeleteDialogOpen(false);
      setDeletingCustomer(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'An error occurred. Please try again.');
    },
  });

  const onSubmit = (data: CustomerForm) => {
    saveMutation.mutate({ ...data, id: editingCustomer || undefined });
  };

  const openDeleteDialog = (id: string) => {
    const customer = customers.find((c: Customer & { id: string }) => c.id === id);
    if (customer) {
      setDeletingCustomer({ id: customer.id, name: customer.name });
      setDeleteDialogOpen(true);
    }
  };

  const handleDelete = () => {
    if (!deletingCustomer) return;
    deleteMutation.mutate(deletingCustomer.id);
  };

  const handleEdit = (customer: Customer & { id: string }) => {
    setEditingCustomer(customer.id);
    form.reset({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      openingBalance: customer.openingBalance,
      balanceType: customer.balanceType,
    });
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <Button
            onClick={() => {
              form.reset();
              setEditingCustomer(null);
              setIsModalOpen(true);
            }}
          >
            Add Customer
          </Button>
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No customers yet.</p>
            <p className="text-muted-foreground mt-2">Add your first customer to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {customers.map((customer) => (
              <EntityCard
                key={customer.id}
                entity={{
                  id: customer.id,
                  name: customer.name,
                  phone: customer.phone,
                  email: customer.email,
                  address: customer.address,
                  totalBalance: customer.totalBalance,
                }}
                entityType="customer"
                onEdit={() => handleEdit(customer)}
                onDelete={openDeleteDialog}
              />
            ))}
          </div>
        )}

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
              <DialogDescription>
                {editingCustomer ? 'Update customer information' : 'Create a new customer'}
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
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsModalOpen(false);
                      form.reset();
                      setEditingCustomer(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingCustomer ? 'Update' : 'Create'}
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
              <DialogTitle >Delete Customer</DialogTitle>
              <DialogDescription asChild>
                <div className="pt-2 space-y-2 text-sm text-muted-foreground">
                  <p>
                    Are you sure you want to delete <span className="font-semibold text-red-700">{deletingCustomer?.name}</span>?
                  </p>
                  <p className=" font-medium text-gray-500 ">
                    This will permanently delete the customer and ALL associated transactions. This action cannot be undone and your data will be lost forever.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDeletingCustomer(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                className="bg-red-700 hover:bg-red-800"
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

