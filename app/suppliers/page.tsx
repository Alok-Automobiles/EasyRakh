'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import SupplierCard from '@/components/SupplierCard';
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
  const hasFetchedRef = useRef(false);
  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      openingBalance: 0,
      balanceType: 'debit',
    },
  });

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
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
        const result = await response.json();
        const nextSupplierId = editingSupplier ?? result.supplier?.id;

        toast.success(
          editingSupplier
            ? 'Supplier updated successfully!'
            : 'Supplier created successfully!'
        );
        setIsModalOpen(false);
        form.reset();
        setEditingSupplier(null);

        if (!editingSupplier && nextSupplierId) {
          router.push(`/ledger/supplier/${nextSupplierId}`);
          return;
        }

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
    form.reset({
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
          <h1 className="text-3xl font-bold text-foreground">Suppliers</h1>
          <Button
            onClick={() => {
              form.reset();
              setEditingSupplier(null);
              setIsModalOpen(true);
            }}
          >
            Add Supplier
          </Button>
        </div>

        {suppliers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No suppliers yet.</p>
            <p className="text-muted-foreground mt-2">Add your first supplier to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="relative">
                <SupplierCard
                  supplier={supplier}
                  onDelete={handleDelete}
                />
                <Button
                  onClick={() => handleEdit(supplier)}
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                >
                  Edit
                </Button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
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
                      setEditingSupplier(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingSupplier ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}

