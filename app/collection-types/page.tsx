'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'motion/react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ACTION_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { handleEnterToNextFormField } from '@/lib/form-keyboard-navigation';

const collectionTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
});

type CollectionTypeForm = z.infer<typeof collectionTypeSchema>;

interface CollectionType {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export default function CollectionTypesPage() {
  const router = useRouter();
  const [collectionTypes, setCollectionTypes] = useState<CollectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCollectionType, setEditingCollectionType] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const form = useForm<CollectionTypeForm>({
    resolver: zodResolver(collectionTypeSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchCollectionTypes();
  }, []);

  const fetchCollectionTypes = async () => {
    try {
      const response = await fetch('/api/collection-types');
      if (response.ok) {
        const data = await response.json();
        setCollectionTypes(data.collectionTypes);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch (error) {
      toast.error('Failed to fetch collection types');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CollectionTypeForm) => {
    try {
      const url = editingCollectionType
        ? `/api/collection-types/${editingCollectionType}`
        : '/api/collection-types';
      const method = editingCollectionType ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        toast.success(
          editingCollectionType
            ? 'Collection type updated successfully!'
            : 'Collection type created successfully!'
        );
        setIsModalOpen(false);
        form.reset();
        setEditingCollectionType(null);
        fetchCollectionTypes();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to save collection type');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this collection type? This will only work if there are no entities in this collection.')) {
      return;
    }

    try {
      const response = await fetch(`/api/collection-types/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Collection type deleted successfully!');
        fetchCollectionTypes();
      } else {
        const result = await response.json();
        toast.error(result.error || 'Failed to delete collection type');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const handleEdit = (collectionType: CollectionType) => {
    setEditingCollectionType(collectionType.id);
    form.reset({
      name: collectionType.name,
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
          <h1 className="text-3xl font-bold text-foreground">Custom Collections</h1>
          <Button
            onClick={() => {
              form.reset();
              setEditingCollectionType(null);
              setIsModalOpen(true);
            }}
            data-shortcut-action="new"
            data-app-shortcut={ACTION_SHORTCUTS.primary.display}
            aria-keyshortcuts={ACTION_SHORTCUTS.primary.aria}
          >
            Create Collection
          </Button>
        </div>

        <p className="text-muted-foreground mb-6">
          Create custom collection types to organize your entities (e.g., Shopkeepers, Employees, etc.)
        </p>

        {collectionTypes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No custom collections yet.</p>
            <p className="text-muted-foreground mt-2">Create your first custom collection to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collectionTypes.map((collectionType) => (
              <Card key={collectionType.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <Link
                        href={`/custom-entities/${collectionType.slug}`}
                        className="text-xl font-semibold text-foreground hover:text-primary"
                      >
                        {collectionType.name}
                      </Link>
                      <p className="text-sm text-muted-foreground mt-1">
                        Slug: {collectionType.slug}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created: {format(new Date(collectionType.createdAt), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => handleEdit(collectionType)}
                        variant="ghost"
                        size="sm"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleDelete(collectionType.id)}
                        variant="destructive"
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCollectionType ? 'Edit Collection Type' : 'Create Collection Type'}
              </DialogTitle>
              <DialogDescription>
                {editingCollectionType
                  ? 'Update collection type information'
                  : 'Create a new collection type (e.g., Shopkeepers, Employees)'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleEnterToNextFormField} className="space-y-4">
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
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsModalOpen(false);
                      form.reset();
                      setEditingCollectionType(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingCollectionType ? 'Update' : 'Create'}
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

