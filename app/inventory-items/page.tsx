'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Filter,
  ImagePlus,
  Loader2,
  MapPin,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InventoryStats } from '@/lib/types';
import { compressImage, formatFileSize, isCompressibleImage } from '@/lib/imageCompression';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const COMPRESSION_TARGET_BYTES = 1 * 1024 * 1024;
const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];
const ACCEPTED_PART_TYPES = ACCEPTED_BILL_TYPES.filter((type) => type.startsWith('image/'));

interface PendingUpload {
  tempId: string;
  previewUrl: string;
  fileName: string;
  isImage: boolean;
  status: 'compressing' | 'uploading' | 'error';
  error?: string;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inventoryItemSchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  itemNumber: z.string().min(1, 'Item number is required'),
  uniqueCode: z.string().optional(),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  location: z.string().min(1, 'Location is required'),
  unitOfMeasure: z.string().min(1, 'Unit is required'),
  partImages: z.array(z.string()).default([]),
  brand: z.string().optional(),
  description: z.string().optional(),
  buyingPrice: z.number().min(0, 'Buying price cannot be negative').optional(),
  mrp: z.number().min(0, 'MRP cannot be negative').optional(),
  supplier: z.string().optional(),
  billingDate: z.string().optional(),
  billImages: z.array(z.string()).default([]),
});

type InventoryItemForm = z.input<typeof inventoryItemSchema>;
type StatusFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';
type UploadKind = 'part' | 'bill';

interface InventoryItem {
  id: string;
  itemName: string;
  itemNumber: string;
  uniqueCode?: string;
  quantity: number;
  location: string;
  unitOfMeasure: string;
  partImages: string[];
  brand?: string;
  description?: string;
  buyingPrice?: number;
  mrp?: number;
  supplier?: string;
  billingDate?: string;
  billImages: string[];
  createdAt: string;
  updatedAt: string;
}

interface InventoryItemsResponse {
  items: InventoryItem[];
  stats: InventoryStats;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const defaultStats: InventoryStats = {
  totalItems: 0,
  totalQuantity: 0,
  totalValue: 0,
  outOfStockItems: 0,
  restockItems: 0,
  lowStockThreshold: 5,
  locations: [],
  brands: [],
};

const defaultFormValues: InventoryItemForm = {
  itemName: '',
  itemNumber: '',
  uniqueCode: '',
  quantity: 0,
  location: '',
  unitOfMeasure: 'pcs',
  partImages: [],
  brand: '',
  description: '',
  buyingPrice: undefined,
  mrp: undefined,
  supplier: '',
  billingDate: '',
  billImages: [],
};

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'in-stock', label: 'In Stock' },
  { value: 'low-stock', label: 'Restock' },
  { value: 'out-of-stock', label: 'Out of Stock' },
];

const unitOptions = ['pcs', 'set', 'box', 'pair', 'kg', 'litre', 'meter', 'roll', 'pack'];

const formatCurrency = (value?: number) => currencyFormatter.format(value || 0);

function dateToInputValue(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function getStockStatus(item: InventoryItem, threshold: number) {
  if (item.quantity <= 0) {
    return {
      label: 'Out',
      className: 'bg-red-100 text-red-700 border-red-200',
      dotClassName: 'bg-red-500',
    };
  }
  if (item.quantity <= threshold) {
    return {
      label: 'Restock',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
      dotClassName: 'bg-amber-500',
    };
  }
  return {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dotClassName: 'bg-emerald-500',
  };
}

function normalizeSubmission(values: InventoryItemForm) {
  return {
    ...values,
    itemName: values.itemName.trim(),
    itemNumber: values.itemNumber.trim(),
    uniqueCode: values.uniqueCode?.trim() || '',
    location: values.location.trim(),
    unitOfMeasure: values.unitOfMeasure,
    brand: values.brand?.trim() || '',
    description: values.description?.trim() || '',
    buyingPrice: values.buyingPrice === undefined || Number.isNaN(values.buyingPrice) ? undefined : values.buyingPrice,
    mrp: values.mrp === undefined || Number.isNaN(values.mrp) ? undefined : values.mrp,
    supplier: values.supplier?.trim() || '',
    billingDate: values.billingDate || undefined,
    partImages: values.partImages || [],
    billImages: values.billImages || [],
  };
}

function ItemImageCarousel({ images, itemName }: { images: string[]; itemName: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollTo = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const target = Math.max(0, Math.min(index, images.length - 1));
    container.scrollTo({ left: target * container.clientWidth, behavior: 'smooth' });
    setActiveIndex(target);
  }, [images.length]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const idx = Math.round(container.scrollLeft / Math.max(container.clientWidth, 1));
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  if (images.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 to-slate-100">
        <Package className="h-12 w-12 text-gray-300" strokeWidth={1.2} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="relative h-full w-full shrink-0 snap-center"
          >
            <Image
              src={url}
              alt={`${itemName} ${idx + 1}`}
              fill
              sizes="(max-width: 768px) 50vw, 320px"
              className="object-contain p-3"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              scrollTo(activeIndex - 1);
            }}
            disabled={activeIndex === 0}
            className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-gray-700 opacity-0 shadow transition-opacity duration-200 hover:bg-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:group-hover:opacity-30"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              scrollTo(activeIndex + 1);
            }}
            disabled={activeIndex >= images.length - 1}
            className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-gray-700 opacity-0 shadow transition-opacity duration-200 hover:bg-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:group-hover:opacity-30"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-white/80 px-1.5 py-1">
            {images.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === activeIndex ? 'w-3.5 bg-slate-900' : 'w-1.5 bg-slate-300'
                }`}
              />
            ))}
          </div>
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            {activeIndex + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
}

function InventoryItemCard({
  item,
  threshold,
  onEdit,
  onDelete,
}: {
  item: InventoryItem;
  threshold: number;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}) {
  const status = getStockStatus(item, threshold);
  const stockValue = (item.buyingPrice || 0) * (item.quantity || 0);
  const images = item.partImages || [];

  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className={`gap-1.5 border ${status.className}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
          {status.label}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="h-8 w-8 text-gray-500 hover:text-gray-900">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Edit3 className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(item)}
              className="text-red-600 focus:bg-red-50 focus:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 aspect-[4/3] overflow-hidden rounded-lg bg-gray-50">
        <ItemImageCarousel images={images} itemName={item.itemName} />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <h3 className="truncate text-sm font-semibold text-gray-950" title={item.itemName}>
            {item.itemName}
          </h3>
          <p className="mt-1 truncate text-xs text-gray-500" title={item.itemNumber}>
            {item.itemNumber} {item.brand ? `• ${item.brand}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-gray-50 p-2">
            <p className="text-gray-400">Quantity</p>
            <p className="truncate font-bold text-gray-900">
              {item.quantity} {item.unitOfMeasure}
            </p>
          </div>
          <div className="rounded-md bg-gray-50 p-2">
            <p className="text-gray-400">Stock Value</p>
            <p className="truncate font-bold text-gray-900">{formatCurrency(stockValue)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={item.location}>{item.location}</span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs">
          <span className="truncate text-gray-500">
            Cost <span className="font-semibold text-gray-800">{item.buyingPrice ? formatCurrency(item.buyingPrice) : '-'}</span>
          </span>
          <span className="truncate text-gray-500">
            MRP <span className="font-semibold text-gray-800">{item.mrp ? formatCurrency(item.mrp) : '-'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function InventoryItemsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const partInputRef = useRef<HTMLInputElement>(null);
  const billInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [pendingPartUploads, setPendingPartUploads] = useState<PendingUpload[]>([]);
  const [pendingBillUploads, setPendingBillUploads] = useState<PendingUpload[]>([]);
  const [itemNumberCheck, setItemNumberCheck] = useState<{
    status: 'idle' | 'checking' | 'ok' | 'duplicate';
    conflict?: { id: string; itemName: string; itemNumber: string };
  }>({ status: 'idle' });

  const form = useForm<InventoryItemForm>({
    resolver: zodResolver(inventoryItemSchema),
    defaultValues: defaultFormValues,
  });

  const watchedItemNumber = form.watch('itemNumber');
  const editingItemId = editingItem?.id;

  useEffect(() => {
    if (!formOpen) return;
    const trimmed = (watchedItemNumber || '').trim();
    if (!trimmed) {
      setItemNumberCheck({ status: 'idle' });
      return;
    }

    if (editingItem && trimmed.toLowerCase() === editingItem.itemNumber.toLowerCase()) {
      setItemNumberCheck({ status: 'idle' });
      return;
    }

    setItemNumberCheck((prev) => ({ ...prev, status: 'checking' }));
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ itemNumber: trimmed });
        if (editingItemId) params.set('excludeId', editingItemId);
        const response = await fetch(`/api/inventory/check-number?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setItemNumberCheck({ status: 'idle' });
          return;
        }
        const result = (await response.json()) as {
          exists: boolean;
          item?: { id: string; itemName: string; itemNumber: string };
        };
        if (result.exists && result.item) {
          setItemNumberCheck({ status: 'duplicate', conflict: result.item });
        } else {
          setItemNumberCheck({ status: 'ok' });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setItemNumberCheck({ status: 'idle' });
        }
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [watchedItemNumber, formOpen, editingItem, editingItemId]);

  useEffect(() => {
    return () => {
      pendingPartUploads.forEach((upload) => {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      });
      pendingBillUploads.forEach((upload) => {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const newItem = params.get('new');
    const statusParam = params.get('status') as StatusFilter | null;
    const searchParam = params.get('search');

    if (searchParam) setSearchQuery(searchParam);
    if (statusParam && statusTabs.some((tab) => tab.value === statusParam)) {
      setStatusFilter(statusParam);
    }
    if (newItem === '1') {
      setEditingItem(null);
      form.reset(defaultFormValues);
      setFormOpen(true);
    }
  }, [form]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const { data, isLoading, isFetching } = useQuery<InventoryItemsResponse>({
    queryKey: ['inventory-items', searchQuery, statusFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', currentPage.toString());
      params.set('limit', '16');

      const response = await fetch(`/api/inventory?${params.toString()}`, { cache: 'no-store' });
      if (response.status === 401) {
        router.push('/login');
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch inventory items');
      return response.json();
    },
  });

  const items = data?.items || [];
  const stats = data?.stats || defaultStats;
  const pagination = data?.pagination;
  const partImages = form.watch('partImages') || [];
  const billImages = form.watch('billImages') || [];

  const tabCounts = useMemo(
    () => ({
      all: stats.totalItems,
      'in-stock': Math.max(stats.totalItems - stats.outOfStockItems - stats.restockItems, 0),
      'low-stock': stats.restockItems,
      'out-of-stock': stats.outOfStockItems,
    }),
    [stats]
  );

  const saveMutation = useMutation({
    mutationFn: async (values: InventoryItemForm) => {
      const payload = normalizeSubmission(values);
      const url = editingItem ? `/api/inventory/${editingItem.id}` : '/api/inventory';
      const method = editingItem ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save item');
      return result;
    },
    onSuccess: () => {
      toast.success(editingItem ? 'Inventory item updated' : 'Inventory item added');
      setFormOpen(false);
      setEditingItem(null);
      form.reset(defaultFormValues);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save item');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete item');
      return result;
    },
    onSuccess: () => {
      toast.success('Inventory item deleted');
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete item');
    },
  });

  const openNewItem = () => {
    cancelAllPendingUploads();
    setItemNumberCheck({ status: 'idle' });
    setEditingItem(null);
    form.reset(defaultFormValues);
    setFormOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    cancelAllPendingUploads();
    setItemNumberCheck({ status: 'idle' });
    setEditingItem(item);
    form.reset({
      itemName: item.itemName,
      itemNumber: item.itemNumber,
      uniqueCode: item.uniqueCode || '',
      quantity: item.quantity,
      location: item.location,
      unitOfMeasure: item.unitOfMeasure || 'pcs',
      partImages: item.partImages || [],
      brand: item.brand || '',
      description: item.description || '',
      buyingPrice: item.buyingPrice,
      mrp: item.mrp,
      supplier: item.supplier || '',
      billingDate: dateToInputValue(item.billingDate),
      billImages: item.billImages || [],
    });
    setFormOpen(true);
  };

  const uploadSingleFile = useCallback(
    async (file: File, kind: UploadKind) => {
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const isImage = file.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : '';
      const setPending = kind === 'part' ? setPendingPartUploads : setPendingBillUploads;

      setPending((prev) => [
        ...prev,
        {
          tempId,
          previewUrl,
          fileName: file.name,
          isImage,
          status: isCompressibleImage(file) ? 'compressing' : 'uploading',
        },
      ]);

      try {
        let fileToUpload = file;

        if (isCompressibleImage(file) && file.size > COMPRESSION_TARGET_BYTES) {
          const result = await compressImage(file, COMPRESSION_TARGET_BYTES);
          if (result.wasCompressed) {
            fileToUpload = result.file;
          }
        }

        if (fileToUpload.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`${file.name} (${formatFileSize(fileToUpload.size)}) is over the 5MB limit.`);
        }

        setPending((prev) =>
          prev.map((upload) =>
            upload.tempId === tempId ? { ...upload, status: 'uploading' } : upload
          )
        );

        const formData = new FormData();
        formData.append('file', fileToUpload);
        const response = await fetch('/api/uploads/bill', { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed');

        const fieldName = kind === 'part' ? 'partImages' : 'billImages';
        const currentUrls = (form.getValues(fieldName) || []) as string[];
        form.setValue(fieldName, [...currentUrls, result.url], { shouldDirty: true });

        setPending((prev) => prev.filter((upload) => upload.tempId !== tempId));
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setPending((prev) =>
          prev.map((upload) =>
            upload.tempId === tempId
              ? { ...upload, status: 'error', error: message }
              : upload
          )
        );
        toast.error(message);
      }
    },
    [form]
  );

  const handleFileSelect = (files: FileList | null, kind: UploadKind) => {
    if (!files || files.length === 0) return;
    const acceptedTypes = kind === 'part' ? ACCEPTED_PART_TYPES : ACCEPTED_BILL_TYPES;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!acceptedTypes.includes(file.type)) {
        toast.error(
          kind === 'part'
            ? `${file.name}: part photos must be images.`
            : `${file.name}: upload JPG, PNG, WEBP, HEIC/HEIF, or PDF.`
        );
        continue;
      }
      if (!isCompressibleImage(file) && file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`${file.name} must be under 5MB.`);
        continue;
      }
      validFiles.push(file);
    }

    validFiles.forEach((file) => {
      void uploadSingleFile(file, kind);
    });

    if (kind === 'part' && partInputRef.current) partInputRef.current.value = '';
    if (kind === 'bill' && billInputRef.current) billInputRef.current.value = '';
  };

  const removePendingUpload = (kind: UploadKind, tempId: string) => {
    const setPending = kind === 'part' ? setPendingPartUploads : setPendingBillUploads;
    setPending((prev) => {
      const target = prev.find((upload) => upload.tempId === tempId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((upload) => upload.tempId !== tempId);
    });
  };

  const cancelAllPendingUploads = useCallback(() => {
    setPendingPartUploads((prev) => {
      prev.forEach((upload) => {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      });
      return [];
    });
    setPendingBillUploads((prev) => {
      prev.forEach((upload) => {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      });
      return [];
    });
  }, []);

  const removeImage = (fieldName: 'partImages' | 'billImages', url: string) => {
    const nextUrls = ((form.getValues(fieldName) || []) as string[]).filter((item) => item !== url);
    form.setValue(fieldName, nextUrls, { shouldDirty: true });
  };

  const partUploadingCount = pendingPartUploads.filter((u) => u.status !== 'error').length;
  const billUploadingCount = pendingBillUploads.filter((u) => u.status !== 'error').length;
  const totalUploadingCount = partUploadingCount + billUploadingCount;
  const hasItemNumberConflict = itemNumberCheck.status === 'duplicate';

  const onSubmit = (values: InventoryItemForm) => {
    if (hasItemNumberConflict) {
      toast.error('Item number already exists. Use a different one.');
      return;
    }
    if (totalUploadingCount > 0) {
      toast.error(`Wait for ${totalUploadingCount} upload${totalUploadingCount > 1 ? 's' : ''} to finish first.`);
      return;
    }
    saveMutation.mutate(values);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 space-y-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-900 p-3 text-white shadow-sm">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">Inventory Items</h1>
            <p className="text-sm text-gray-500">
              {pagination?.total ?? stats.totalItems} products across {stats.locations.length} locations
            </p>
          </div>
        </div>
        <Button onClick={openNewItem} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  statusFilter === tab.value
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                  {tabCounts[tab.value]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search item, brand, code..."
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500">
              <Filter className="h-4 w-4" />
              {isFetching ? 'Refreshing' : `${items.length} shown`}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-80 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white px-4 py-16 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300" strokeWidth={1.2} />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No inventory items found</h2>
          <p className="mt-2 text-sm text-gray-500">Add your first stock item or clear the current filters.</p>
          <Button onClick={openNewItem} className="mt-5 bg-slate-900 text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <InventoryItemCard
              key={item.id}
              item={item}
              threshold={stats.lowStockThreshold}
              onEdit={openEditItem}
              onDelete={(selectedItem) => {
                setDeletingItem(selectedItem);
                setDeleteDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-300"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
          >
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, index) => {
              let page = index + 1;
              if (pagination.totalPages > 5 && currentPage > 3) {
                page = Math.min(currentPage - 2 + index, pagination.totalPages - 4 + index);
              }
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  className={currentPage === page ? 'bg-slate-900 text-white hover:bg-slate-800' : 'border-gray-300'}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-gray-300"
            disabled={currentPage >= pagination.totalPages}
            onClick={() => setCurrentPage((page) => Math.min(page + 1, pagination.totalPages))}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingItem(null);
            form.reset(defaultFormValues);
            cancelAllPendingUploads();
            setItemNumberCheck({ status: 'idle' });
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit inventory item' : 'Add inventory item'}</DialogTitle>
            <DialogDescription>
              Capture quantity, location, buying code, pricing and bills in one place.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Brake pad set" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="itemNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item number *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="BP-204"
                            {...field}
                            value={field.value || ''}
                            className={`pr-9 ${
                              itemNumberCheck.status === 'duplicate'
                                ? 'border-red-300 focus-visible:ring-red-200'
                                : itemNumberCheck.status === 'ok'
                                  ? 'border-emerald-300 focus-visible:ring-emerald-200'
                                  : ''
                            }`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {itemNumberCheck.status === 'checking' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : itemNumberCheck.status === 'duplicate' ? (
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            ) : itemNumberCheck.status === 'ok' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : null}
                          </span>
                        </div>
                      </FormControl>
                      {itemNumberCheck.status === 'duplicate' && itemNumberCheck.conflict ? (
                        <p className="mt-1 text-xs text-red-600">
                          Already used by{' '}
                          <span className="font-semibold">{itemNumberCheck.conflict.itemName}</span>. Choose a unique number.
                        </p>
                      ) : itemNumberCheck.status === 'ok' ? (
                        <p className="mt-1 text-xs text-emerald-600">Item number is available.</p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <FormControl>
                        <Input placeholder="Bosch" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="uniqueCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buying code</FormLabel>
                      <FormControl>
                        <Input placeholder="Shop code written on product" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(event) => field.onChange(parseFloat(event.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unitOfMeasure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {unitOptions.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location *</FormLabel>
                      <FormControl>
                        <Input placeholder="Rack A / Godown 1" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <FormControl>
                        <Input placeholder="Supplier name" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyingPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buying price</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            field.onChange(value === '' ? undefined : parseFloat(value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mrp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MRP</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            field.onChange(value === '' ? undefined : parseFloat(value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing date</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input type="date" className="pl-10" {...field} value={field.value || ''} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Fitment, notes, model compatibility..." {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Part images</Label>
                      <p className="text-xs text-gray-500">
                        {partUploadingCount > 0
                          ? `Uploading ${partUploadingCount} in background...`
                          : 'Photos help identify stock faster.'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-300"
                      onClick={() => partInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4" />
                      {partUploadingCount > 0 ? `Uploading (${partUploadingCount})` : 'Upload'}
                    </Button>
                  </div>
                  <input
                    ref={partInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    className="hidden"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => handleFileSelect(event.target.files, 'part')}
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {partImages.length === 0 && pendingPartUploads.length === 0 ? (
                      <div className="col-span-3 rounded-md border-2 border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
                        No part images
                      </div>
                    ) : (
                      <>
                        {partImages.map((url) => (
                          <div key={url} className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                            <Image src={url} alt="Part image" fill className="object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage('partImages', url)}
                              className="absolute right-1 top-1 rounded-full bg-white p-1 text-gray-600 shadow-sm hover:text-red-600"
                              aria-label="Remove part image"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {pendingPartUploads.map((upload) => (
                          <div
                            key={upload.tempId}
                            className={`relative aspect-square overflow-hidden rounded-md border bg-gray-50 ${
                              upload.status === 'error' ? 'border-red-300' : 'border-gray-200'
                            }`}
                          >
                            {upload.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={upload.previewUrl}
                                alt={upload.fileName}
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
                                <FileText className="h-6 w-6" />
                              </div>
                            )}
                            {upload.status !== 'error' ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-[10px] font-semibold uppercase tracking-wide">
                                  {upload.status === 'compressing' ? 'Compressing' : 'Uploading'}
                                </span>
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-500/70 px-2 text-center text-white">
                                <AlertTriangle className="h-5 w-5" />
                                <span className="line-clamp-2 text-[10px] font-semibold">{upload.error || 'Failed'}</span>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removePendingUpload('part', upload.tempId)}
                              className="absolute right-1 top-1 rounded-full bg-white p-1 text-gray-700 shadow-sm hover:text-red-600"
                              aria-label="Cancel upload"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Bill images</Label>
                      <p className="text-xs text-gray-500">
                        {billUploadingCount > 0
                          ? `Uploading ${billUploadingCount} in background...`
                          : 'Attach purchase bill images or PDFs.'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-300"
                      onClick={() => billInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      {billUploadingCount > 0 ? `Uploading (${billUploadingCount})` : 'Upload'}
                    </Button>
                  </div>
                  <input
                    ref={billInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => handleFileSelect(event.target.files, 'bill')}
                  />
                  <div className="mt-3 space-y-2">
                    {billImages.length === 0 && pendingBillUploads.length === 0 ? (
                      <div className="rounded-md border-2 border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
                        No bills attached
                      </div>
                    ) : (
                      <>
                        {billImages.map((url, index) => (
                          <div key={url} className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-gray-500">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">Bill {index + 1}</p>
                              <p className="truncate text-xs text-gray-500">{url}</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeImage('billImages', url)}
                              className="text-gray-500 hover:text-red-600"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {pendingBillUploads.map((upload) => (
                          <div
                            key={upload.tempId}
                            className={`flex items-center gap-3 rounded-md border bg-gray-50 p-2 ${
                              upload.status === 'error' ? 'border-red-300' : 'border-gray-200'
                            }`}
                          >
                            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-white text-gray-500">
                              {upload.isImage && upload.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={upload.previewUrl}
                                  alt={upload.fileName}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <FileText className="h-5 w-5" />
                              )}
                              {upload.status !== 'error' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{upload.fileName}</p>
                              <p className={`truncate text-xs ${upload.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                                {upload.status === 'error'
                                  ? upload.error || 'Upload failed'
                                  : upload.status === 'compressing'
                                    ? 'Compressing image...'
                                    : 'Uploading in background...'}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removePendingUpload('bill', upload.tempId)}
                              className="text-gray-500 hover:text-red-600"
                              aria-label="Cancel upload"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                {totalUploadingCount > 0 && (
                  <p className="mr-auto flex items-center gap-2 text-xs font-medium text-amber-700">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {totalUploadingCount} upload{totalUploadingCount > 1 ? 's' : ''} still finishing
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="border-gray-300"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingItem(null);
                    form.reset(defaultFormValues);
                    cancelAllPendingUploads();
                    setItemNumberCheck({ status: 'idle' });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    saveMutation.isPending ||
                    totalUploadingCount > 0 ||
                    hasItemNumberConflict ||
                    itemNumberCheck.status === 'checking'
                  }
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {saveMutation.isPending
                    ? 'Saving...'
                    : totalUploadingCount > 0
                      ? 'Uploading...'
                      : editingItem
                        ? 'Update Item'
                        : 'Add Item'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete inventory item</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm text-gray-500">
                <p>
                  Delete <span className="font-semibold text-red-700">{deletingItem?.itemName}</span> from inventory?
                </p>
                <p>This removes the stock record and its saved image links from EasyRakh.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="border-gray-300"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingItem(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={deleteMutation.isPending}
              onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
