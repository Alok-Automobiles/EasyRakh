'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import CustomEntityCard from '@/components/CustomEntityCard';
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
import { CustomEntity } from '@/lib/types';
import { motion } from 'motion/react'
import Link from 'next/link';

const customEntitySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(['credit', 'debit']).default('debit'),
});

type CustomEntityForm = z.infer<typeof customEntitySchema>;

interface CollectionType {
  id: string;
  name: string;
  slug: string;
}

export default function CustomEntitiesPage() {
  const router = useRouter();
  const params = useParams();
  const collectionTypeSlug = params.collectionType as string;
  const [entities, setEntities] = useState<(CustomEntity & { id: string })[]>([]);
  const [collectionType, setCollectionType] = useState<CollectionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const form = useForm<CustomEntityForm>({
    resolver: zodResolver(customEntitySchema),
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
    fetchCollectionType();
    fetchEntities();
  }, [collectionTypeSlug]);

  const fetchCollectionType = async () => {
    try {
      const response = await fetch('/api/collection-types');
      if (response.ok) {
        const data = await response.json();
        const ct = data.collectionTypes.find((ct: CollectionType) => ct.slug === collectionTypeSlug);
        if (ct) {
          setCollectionType(ct);
        } else {
          toast.error('Collection type not found');
          router.push('/collection-types');
        }
      }
    } catch (error) {
      toast.error('Failed to fetch collection type');
    }
  };

  const fetchEntities = async () => {
    try {
      const response = await fetch(`/api/custom-entities?collectionType=${collectionTypeSlug}`);
      if (response.ok) {
        const data = await response.json();
        setEntities(data.entities);
      } else if (response.status === 401) {
        router.push('/login');
      } else if (response.status === 404) {
        toast.error('Collection type not found');
        router.push('/collection-types');
      }
    } catch (error) {
      toast.error('Failed to fetch entities');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CustomEntityForm) => {
    try {
      const url = editingEntity
        ? `/api/custom-entities/${editingEntity}`
        : '/api/custom-entities';
      const method = editingEntity ? 'PUT' : 'POST';

      const payload = {
        ...data,
        collectionType: collectionTypeSlug,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        const nextEntityId = editingEntity ?? result.entity?.id;

        toast.success(
          editingEntity
            ? 'Entity updated successfully!'
            : 'Entity created successfully!'
        );
        setIsModalOpen(false);
        form.reset();
        setEditingEntity(null);

        if (!editingEntity && nextEntityId) {
          router.push(`/ledger/${collectionTypeSlug}/${nextEntityId}`);
          return;
        }

        fetchEntities();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to save entity');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entity?')) {
      return;
    }

    try {
      const response = await fetch(`/api/custom-entities/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Entity deleted successfully!');
        fetchEntities();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to delete entity');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleEdit = (entity: CustomEntity & { id: string }) => {
    setEditingEntity(entity.id);
    form.reset({
      name: entity.name,
      phone: entity.phone || '',
      email: entity.email || '',
      address: entity.address || '',
      openingBalance: entity.openingBalance,
      balanceType: entity.balanceType,
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

  if (!collectionType) {
    return null;
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
          <div>
            <Link
              href="/collection-types"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2 inline-block"
            >
              ← Back to Custom Collections
            </Link>
            <h1 className="text-3xl font-bold text-foreground">{collectionType.name}</h1>
          </div>
          <Button
            onClick={() => {
              form.reset();
              setEditingEntity(null);
              setIsModalOpen(true);
            }}
          >
            Add {collectionType.name.slice(0, -1) || 'Entity'}
          </Button>
        </div>

        {entities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No entities yet.</p>
            <p className="text-muted-foreground mt-2">Add your first entity to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entities.map((entity) => (
              <div key={entity.id} className="relative">
                <CustomEntityCard
                  entity={entity}
                  collectionTypeSlug={collectionTypeSlug}
                  onDelete={handleDelete}
                />
                <Button
                  onClick={() => handleEdit(entity)}
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
              <DialogTitle>
                {editingEntity ? `Edit ${collectionType.name.slice(0, -1) || 'Entity'}` : `Add ${collectionType.name.slice(0, -1) || 'Entity'}`}
              </DialogTitle>
              <DialogDescription>
                {editingEntity ? 'Update entity information' : `Create a new ${collectionType.name.slice(0, -1) || 'entity'}`}
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
                      setEditingEntity(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingEntity ? 'Update' : 'Create'}
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

