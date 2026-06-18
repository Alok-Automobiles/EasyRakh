'use client';

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { format } from 'date-fns';
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
  ArrowLeft,
  Boxes,
  Camera,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit3,
  FileDown,
  FileText,
  Filter,
  ImagePlus,
  Loader2,
  MapPin,
  Minus,
  MoreVertical,
  Package,
  Plus,
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
const INACTIVE_THRESHOLD_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PendingUpload {
  tempId: string;
  previewUrl: string;
  fileName: string;
  sourceFile: File;
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
  itemNumber: z.string().optional(),
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
  billingDate: z
    .string()
    .optional()
    .refine((s) => !s?.trim() || /^\d{2}\/\d{2}\/\d{4}$/.test(s.trim()), 'Use DD/MM/YYYY')
    .refine((s) => !s?.trim() || parseDdMmYyyyToIsoDate(s.trim()) !== undefined, 'Invalid billing date'),
  billImages: z.array(z.string()).default([]),
});

type InventoryItemForm = z.input<typeof inventoryItemSchema>;
type StatusFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock' | 'inactive';
type UploadKind = 'part' | 'bill';
type OrderStep = 'select' | 'review';

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
  lastQuantityUpdatedAt?: string;
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
  inactiveItems: 0,
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
  { value: 'inactive', label: 'Inactive' },
];

const unitOptions = ['pcs', 'set', 'box', 'pair', 'kg', 'litre', 'meter', 'roll', 'pack'];

/** Pointer on all clickable inventory UI (native buttons, links, menu items). */
const inventoryPointerClass =
  '[&_button:not(:disabled)]:cursor-pointer [&_a]:cursor-pointer [&_[role=menuitem]:not([data-disabled])]:cursor-pointer [&_[data-slot=dialog-close]]:cursor-pointer [&_[data-slot=select-trigger]:not(:disabled)]:cursor-pointer';

function normalizeUnitForForm(unit: string) {
  const u = unit.trim().toLowerCase();
  return unitOptions.includes(u) ? u : 'pcs';
}

/** Mask typed digits as DD/MM/YYYY while typing. */
function formatBillingDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts: string[] = [];
  if (digits.length > 0) parts.push(digits.slice(0, Math.min(2, digits.length)));
  if (digits.length > 2) parts.push(digits.slice(2, Math.min(4, digits.length)));
  if (digits.length > 4) parts.push(digits.slice(4));
  return parts.join('/');
}

/** Parse DD/MM/YYYY to ISO string for API, or undefined if empty/invalid. */
function parseDdMmYyyyToIsoDate(display: string): string | undefined {
  const trimmed = display.trim();
  if (!trimmed) return undefined;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!m) return undefined;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString();
}

/** Edit form: show stored ISO/API date as DD/MM/YYYY. */
function isoOrStoredDateToDdMmYyyy(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear());
  return `${d}/${mo}/${y}`;
}

const formatCurrency = (value?: number) => currencyFormatter.format(value || 0);

function formatItemUpdatedAt(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd MMM yyyy, h:mm a');
}

function getStockStatus(item: InventoryItem, threshold: number) {
  if (item.quantity <= 0) {
    const quantityUpdatedAt = item.lastQuantityUpdatedAt;
    const quantityUpdatedAtTime = quantityUpdatedAt
      ? new Date(quantityUpdatedAt).getTime()
      : Number.NaN;

    if (
      !Number.isNaN(quantityUpdatedAtTime) &&
      quantityUpdatedAtTime <= Date.now() - INACTIVE_THRESHOLD_DAYS * MS_PER_DAY
    ) {
      return {
        label: 'Inactive',
        className: 'bg-gray-100 text-gray-700 border-gray-200',
        dotClassName: 'bg-gray-500',
      };
    }

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
    itemNumber: values.itemNumber?.trim() || '',
    uniqueCode: values.uniqueCode?.trim() || '',
    location: values.location.trim(),
    unitOfMeasure: values.unitOfMeasure,
    brand: values.brand?.trim() || '',
    description: values.description?.trim() || '',
    buyingPrice: values.buyingPrice === undefined || Number.isNaN(values.buyingPrice) ? undefined : values.buyingPrice,
    mrp: values.mrp === undefined || Number.isNaN(values.mrp) ? undefined : values.mrp,
    supplier: values.supplier?.trim() || '',
    billingDate: parseDdMmYyyyToIsoDate(values.billingDate?.trim() || '') || undefined,
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
            className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/90 p-1.5 text-gray-700 opacity-0 shadow transition-opacity duration-200 hover:bg-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:group-hover:opacity-30"
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
            className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-white/90 p-1.5 text-gray-700 opacity-0 shadow transition-opacity duration-200 hover:bg-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:group-hover:opacity-30"
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
  onAdjustQuantity,
  isAdjusting,
  isOrderMode,
  isSelected,
  onToggleOrderSelection,
}: {
  item: InventoryItem;
  threshold: number;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onAdjustQuantity: (item: InventoryItem, delta: 1 | -1) => void;
  isAdjusting: boolean;
  isOrderMode: boolean;
  isSelected: boolean;
  onToggleOrderSelection: (item: InventoryItem) => void;
}) {
  const status = getStockStatus(item, threshold);
  const stockValue = (item.buyingPrice || 0) * (item.quantity || 0);
  const images = item.partImages || [];
  const quantityControlsDisabled = isAdjusting || isOrderMode;

  return (
    <div
      className={`group max-w-full overflow-hidden rounded-xl border bg-white p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md sm:p-3 ${
        isOrderMode && isSelected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-gray-200'
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant="outline" className={`gap-1.5 border ${status.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} />
            {status.label}
          </Badge>
          {item.location && (
            <span className="inline-flex min-w-0 max-w-[5.5rem] items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 sm:max-w-[8rem]" title={`Location: ${item.location}`}>
              <MapPin className="h-2.5 w-2.5 text-slate-400" />
              <span className="truncate">{item.location}</span>
            </span>
          )}
        </div>
        {isOrderMode ? (
          <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleOrderSelection(item)}
              className="h-4 w-4 cursor-pointer accent-slate-900"
              aria-label={`Select ${item.itemName} for supplier order`}
            />
            <span>Select</span>
          </label>
        ) : (
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
        )}
      </div>

      <div className="mt-3 flex gap-3 sm:block">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-50 sm:h-auto sm:w-full sm:aspect-[4/3]">
          <ItemImageCarousel images={images} itemName={item.itemName} />
        </div>

      <div className="min-w-0 flex-1 space-y-2 sm:mt-4 sm:space-y-3">
        <div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-950 sm:truncate" title={item.itemName}>
            {item.itemName}
          </h3>
          <p className="mt-1 truncate text-xs text-gray-500" title={item.itemNumber || 'No item number'}>
            {item.itemNumber ? item.itemNumber : <span className="italic text-gray-400">No item number</span>}
            {item.brand ? ` • ${item.brand}` : ''}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          <div className="flex min-w-0 flex-col justify-between rounded-lg border border-gray-100 bg-gray-50/80 p-2">
            <span className="text-[10px] font-medium text-gray-400">Quantity</span>
            <div className={`mt-1.5 flex items-center justify-between ${quantityControlsDisabled ? 'pointer-events-none opacity-60' : ''}`}>
              <button
                type="button"
                disabled={quantityControlsDisabled || item.quantity <= 0}
                aria-label={`Decrease quantity for ${item.itemName}`}
                onClick={() => onAdjustQuantity(item, -1)}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-2.5 w-2.5" />
              </button>
              <span className="mx-1 flex min-w-0 items-baseline gap-0.5 text-xs font-bold tabular-nums text-gray-900">
                {item.quantity}
                <span className="text-[9px] font-medium text-gray-400">{item.unitOfMeasure}</span>
              </span>
              <button
                type="button"
                disabled={quantityControlsDisabled}
                aria-label={`Increase quantity for ${item.itemName}`}
                onClick={() => onAdjustQuantity(item, 1)}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-between rounded-lg border border-gray-100 bg-gray-50/80 p-2">
            <span className="text-[10px] font-medium text-gray-400">Stock value</span>
            <div className="mt-1.5 flex h-5 min-w-0 items-center">
              <span className="truncate text-xs font-bold tabular-nums text-gray-900" title={formatCurrency(stockValue)}>
                {formatCurrency(stockValue)}
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-1 border-t border-gray-100 pt-2.5">
          <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="truncate text-gray-500">
              Cost{' '}
              <span className="font-semibold tabular-nums text-gray-800">
                {item.buyingPrice != null ? formatCurrency(item.buyingPrice) : '—'}
              </span>
            </span>
            <span className="truncate text-right text-gray-500">
              MRP{' '}
              <span className="font-semibold tabular-nums text-gray-800">
                {item.mrp != null ? formatCurrency(item.mrp) : '—'}
              </span>
            </span>
          </div>
          <p className="truncate text-[10px] text-gray-400" title={item.updatedAt ? formatItemUpdatedAt(item.updatedAt) : undefined}>
            Updated {formatItemUpdatedAt(item.updatedAt)}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function InventoryItemsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const partInputRef = useRef<HTMLInputElement>(null);
  const partCameraInputRef = useRef<HTMLInputElement>(null);
  const billInputRef = useRef<HTMLInputElement>(null);
  const billCameraInputRef = useRef<HTMLInputElement>(null);
  const partUploadTriggerRef = useRef<HTMLButtonElement>(null);
  const billUploadTriggerRef = useRef<HTMLButtonElement>(null);
  const submitItemRef = useRef<HTMLButtonElement>(null);
  const itemNameInputRef = useRef<HTMLInputElement>(null);
  const itemNumberInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const uniqueCodeInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const unitSelectTriggerRef = useRef<HTMLElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const buyingPriceInputRef = useRef<HTMLInputElement>(null);
  const mrpInputRef = useRef<HTMLInputElement>(null);
  const billingDateInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const unitSkipAdvanceFocusRef = useRef(false);
  const canceledUploadIdsRef = useRef<Set<string>>(new Set());
  const uploadTargetByTempIdRef = useRef<Map<string, string>>(new Map());
  const pendingUploadIdsAtSubmitRef = useRef<Set<string>>(new Set());
  const backgroundAttachQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    if (searchQuery === '') {
      setDebouncedSearchQuery('');
      return;
    }
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350); // 350ms debounce
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [uploadPromptKind, setUploadPromptKind] = useState<'part' | 'bill' | null>(null);
  const [pendingPartUploads, setPendingPartUploads] = useState<PendingUpload[]>([]);
  const [pendingBillUploads, setPendingBillUploads] = useState<PendingUpload[]>([]);
  const [itemNumberCheck, setItemNumberCheck] = useState<{
    status: 'idle' | 'checking' | 'ok' | 'duplicate';
    conflict?: { id: string; itemName: string; itemNumber: string };
  }>({ status: 'idle' });
  const [adjustingItemIds, setAdjustingItemIds] = useState<Set<string>>(new Set());
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isOrderMode, setIsOrderMode] = useState(false);
  const [orderStep, setOrderStep] = useState<OrderStep>('select');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [selectedOrderItems, setSelectedOrderItems] = useState<Record<string, InventoryItem>>({});
  const [orderQuantities, setOrderQuantities] = useState<Record<string, string>>({});
  const [downloadingOrderPdf, setDownloadingOrderPdf] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      const response = await fetch(`/api/inventory/export-pdf?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to generate PDF');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = statusFilter === 'all' ? 'All_Items' : statusFilter;
      a.download = `Inventory_Report_${suffix}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }, [statusFilter]);

  const QUANTITY_ADJUST_DEBOUNCE_MS = 400;

  type PendingQuantityAdjustment = {
    baselineQuantity: number;
    targetQuantity: number;
    timerId: ReturnType<typeof setTimeout> | null;
  };

  const pendingQuantityRef = useRef<Map<string, PendingQuantityAdjustment>>(new Map());
  const flushQuantityAdjustRef = useRef<((id: string) => void) | null>(null);

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

    if (editingItem && trimmed.toLowerCase() === (editingItem.itemNumber || '').toLowerCase()) {
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
  }, [debouncedSearchQuery, statusFilter]);

  const { data, isLoading, isFetching } = useQuery<InventoryItemsResponse>({
    queryKey: ['inventory-items', debouncedSearchQuery, statusFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery.trim()) params.set('search', debouncedSearchQuery.trim());
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
  const inventoryListQueryKey = ['inventory-items', debouncedSearchQuery, statusFilter, currentPage] as const;
  const partImages = form.watch('partImages') || [];
  const billImages = form.watch('billImages') || [];
  const inactiveItems = stats.inactiveItems || 0;

  const tabCounts = useMemo(
    () => ({
      all: stats.totalItems,
      'in-stock': Math.max(stats.totalItems - stats.outOfStockItems - inactiveItems - stats.restockItems, 0),
      'low-stock': stats.restockItems,
      'out-of-stock': stats.outOfStockItems,
      inactive: inactiveItems,
    }),
    [inactiveItems, stats]
  );
  const selectedOrderCount = selectedOrderIds.size;
  const selectedOrderItemsList = useMemo(
    () =>
      Array.from(selectedOrderIds)
        .map((id) => selectedOrderItems[id])
        .filter((item): item is InventoryItem => Boolean(item)),
    [selectedOrderIds, selectedOrderItems]
  );

  const resetOrderFlow = useCallback(() => {
    setIsOrderMode(false);
    setOrderStep('select');
    setSelectedOrderIds(new Set());
    setSelectedOrderItems({});
    setOrderQuantities({});
  }, []);

  const startOrderFlow = useCallback(() => {
    setIsOrderMode(true);
    setOrderStep('select');
    setSelectedOrderIds(new Set());
    setSelectedOrderItems({});
    setOrderQuantities({});
  }, []);

  const toggleOrderSelection = useCallback((item: InventoryItem) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        setSelectedOrderItems((current) => {
          const updated = { ...current };
          delete updated[item.id];
          return updated;
        });
        setOrderQuantities((current) => {
          const updated = { ...current };
          delete updated[item.id];
          return updated;
        });
      } else {
        next.add(item.id);
        setSelectedOrderItems((current) => ({ ...current, [item.id]: item }));
      }
      return next;
    });
  }, []);

  const updateOrderQuantity = useCallback((id: string, value: string) => {
    if (value !== '' && Number(value) < 0) return;
    setOrderQuantities((current) => ({ ...current, [id]: value }));
  }, []);

  const continueToOrderReview = useCallback(() => {
    if (selectedOrderCount === 0) return;
    setOrderStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedOrderCount]);

  const handleDownloadOrderPdf = useCallback(async () => {
    const invalidItem = selectedOrderItemsList.find((item) => {
      const rawQuantity = orderQuantities[item.id]?.trim() || '';
      const quantity = Number(rawQuantity);
      return rawQuantity === '' || !Number.isFinite(quantity) || quantity <= 0;
    });

    if (invalidItem) {
      toast.error(`Enter a quantity greater than zero for ${invalidItem.itemName}.`);
      return;
    }

    setDownloadingOrderPdf(true);
    try {
      const response = await fetch('/api/inventory/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'order',
          items: selectedOrderItemsList.map((item) => ({
            id: item.id,
            quantity: Number(orderQuantities[item.id]),
          })),
        }),
      });

      if (!response.ok) {
        let message = 'Failed to generate supplier order PDF';
        try {
          const result = await response.json();
          if (result?.error) message = result.error;
        } catch {
          // Keep the default message when the server returns a non-JSON error.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `supplier-order-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download supplier order PDF');
    } finally {
      setDownloadingOrderPdf(false);
    }
  }, [orderQuantities, selectedOrderItemsList]);

  const cancelAllPendingUploads = useCallback(() => {
    setPendingPartUploads((prev) => {
      prev.forEach((upload) => {
        canceledUploadIdsRef.current.add(upload.tempId);
        uploadTargetByTempIdRef.current.delete(upload.tempId);
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      });
      return [];
    });
    setPendingBillUploads((prev) => {
      prev.forEach((upload) => {
        canceledUploadIdsRef.current.add(upload.tempId);
        uploadTargetByTempIdRef.current.delete(upload.tempId);
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      });
      return [];
    });
  }, []);

  const focusChainAfterInput: RefObject<HTMLElement | null>[] = [
    itemNameInputRef,
    itemNumberInputRef,
    brandInputRef,
    uniqueCodeInputRef,
    quantityInputRef,
    unitSelectTriggerRef,
    locationInputRef,
    supplierInputRef,
    buyingPriceInputRef,
    mrpInputRef,
    billingDateInputRef,
    descriptionInputRef,
    partUploadTriggerRef,
    billUploadTriggerRef,
    submitItemRef,
  ];

  const handleInventoryFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-slot="select-content"]')) return;
    if (target.closest('[data-slot="select-trigger"]')) return;

    const isInputOrTextArea = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    if (isInputOrTextArea) {
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        if (input.type === 'file' || input.type === 'hidden' || input.type === 'submit') return;
      }

      event.preventDefault();

      const isShift = event.shiftKey;
      const idx = focusChainAfterInput.findIndex((r) => r.current === target);
      if (idx < 0) return;

      if (isShift) {
        if (idx > 0) {
          focusChainAfterInput[idx - 1]?.current?.focus();
        }
      } else {
        if (idx < focusChainAfterInput.length - 1) {
          focusChainAfterInput[idx + 1]?.current?.focus();
        }
      }
      return;
    }

    if (event.shiftKey) {
      const idx = focusChainAfterInput.findIndex((r) => r.current === target);
      if (idx > 0) {
        event.preventDefault();
        focusChainAfterInput[idx - 1]?.current?.focus();
      }
    }
  };

  const openNewItem = useCallback(() => {
    cancelAllPendingUploads();
    setItemNumberCheck({ status: 'idle' });
    setEditingItem(null);
    form.reset(defaultFormValues);
    setFormOpen(true);
  }, [cancelAllPendingUploads, form]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (typeof event.key !== 'string' || !event.key) return;
      const key = event.key.toLowerCase();
      if (key !== 'n') return;
      const ctrlOrCmdN =
        (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      const altN = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (!ctrlOrCmdN && !altN) return;

      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (formOpen || deleteDialogOpen || isOrderMode) return;
      event.preventDefault();
      openNewItem();
    };
    window.addEventListener('keydown', onWindowKeyDown, true);
    return () => window.removeEventListener('keydown', onWindowKeyDown, true);
  }, [deleteDialogOpen, formOpen, isOrderMode, openNewItem]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      if (!key) return;

      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isCmdOrCtrlK = isMac
        ? event.metaKey && key === 'k'
        : event.ctrlKey && key === 'k';

      if (key === '/' || isCmdOrCtrlK) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const id = window.requestAnimationFrame(() => itemNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [formOpen]);

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
    onSuccess: (result, values) => {
      const savedItemId = result.item?.id as string | undefined;
      const submittedUploadIds = pendingUploadIdsAtSubmitRef.current;
      if (savedItemId && submittedUploadIds.size > 0) {
        submittedUploadIds.forEach((tempId) => {
          uploadTargetByTempIdRef.current.set(tempId, savedItemId);
        });

        (['partImages', 'billImages'] as const).forEach((fieldName) => {
          const serverUrls = new Set((result.item?.[fieldName] || []) as string[]);
          const latestUrls = Array.from(
            new Set([
              ...(((values[fieldName] || []) as string[])),
              ...(((form.getValues(fieldName) || []) as string[])),
            ])
          );
          latestUrls
            .filter((url) => !serverUrls.has(url))
            .forEach((url) => attachImageToSavedItem(savedItemId, fieldName, url));
        });
      }
      pendingUploadIdsAtSubmitRef.current = new Set();
      toast.success(editingItem ? 'Inventory item updated' : 'Inventory item added');
      setFormOpen(false);
      setEditingItem(null);
      form.reset(defaultFormValues);
      setPendingPartUploads([]);
      setPendingBillUploads([]);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => {
      pendingUploadIdsAtSubmitRef.current = new Set();
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

  const setItemQuantityInCache = useCallback(
    (id: string, quantity: number) => {
      queryClient.setQueryData<InventoryItemsResponse>(inventoryListQueryKey, (current) => {
        if (!current) return current;
        const now = new Date().toISOString();
        return {
          ...current,
          items: current.items.map((entry) =>
            entry.id === id
              ? { ...entry, quantity, lastQuantityUpdatedAt: now, updatedAt: now }
              : entry
          ),
        };
      });
    },
    [queryClient, inventoryListQueryKey]
  );

  const adjustQuantityMutation = useMutation({
    mutationFn: async ({
      id,
      quantity,
    }: {
      id: string;
      quantity: number;
      baselineQuantity: number;
    }) => {
      const response = await fetch(`/api/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update quantity');
      return result as { item: InventoryItem };
    },
    onMutate: async ({ id, baselineQuantity }) => {
      setAdjustingItemIds((prev) => new Set(prev).add(id));
      const key = inventoryListQueryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const current = queryClient.getQueryData<InventoryItemsResponse>(key);
      const prevItem = current?.items.find((entry) => entry.id === id);
      return {
        key,
        rollbackId: id,
        prevQuantity: baselineQuantity,
        prevUpdatedAt: prevItem?.updatedAt,
        prevLastQuantityUpdatedAt: prevItem?.lastQuantityUpdatedAt,
      };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.key && context.rollbackId) {
        queryClient.setQueryData<InventoryItemsResponse>(context.key, (current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((entry) =>
              entry.id === context.rollbackId
                ? {
                    ...entry,
                    quantity: context.prevQuantity,
                    lastQuantityUpdatedAt: context.prevLastQuantityUpdatedAt ?? entry.lastQuantityUpdatedAt,
                    updatedAt: context.prevUpdatedAt ?? entry.updatedAt,
                  }
                : entry
            ),
          };
        });
      }
      toast.error(error.message || 'Failed to update quantity');
    },
    onSuccess: (result, _vars, context) => {
      if (!context?.key) return;
      queryClient.setQueryData<InventoryItemsResponse>(context.key, (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((entry) =>
            entry.id === result.item.id ? { ...entry, ...result.item } : entry
          ),
        };
      });
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.id) {
        setAdjustingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(variables.id);
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const flushQuantityAdjust = useCallback(
    (id: string) => {
      const pending = pendingQuantityRef.current.get(id);
      if (!pending) return;

      if (pending.timerId) {
        clearTimeout(pending.timerId);
        pending.timerId = null;
      }

      const { baselineQuantity, targetQuantity } = pending;
      pendingQuantityRef.current.delete(id);

      if (targetQuantity === baselineQuantity) return;

      adjustQuantityMutation.mutate({ id, quantity: targetQuantity, baselineQuantity });
    },
    [adjustQuantityMutation]
  );

  useEffect(() => {
    flushQuantityAdjustRef.current = flushQuantityAdjust;
  }, [flushQuantityAdjust]);

  useEffect(() => {
    const pending = pendingQuantityRef.current;
    return () => {
      for (const [id, entry] of pending.entries()) {
        if (entry.timerId) clearTimeout(entry.timerId);
        flushQuantityAdjustRef.current?.(id);
      }
    };
  }, []);

  const scheduleQuantityPersist = useCallback(
    (id: string) => {
      const pending = pendingQuantityRef.current.get(id);
      if (!pending) return;

      if (pending.timerId) clearTimeout(pending.timerId);
      pending.timerId = setTimeout(() => {
        flushQuantityAdjustRef.current?.(id);
      }, QUANTITY_ADJUST_DEBOUNCE_MS);
    },
    [QUANTITY_ADJUST_DEBOUNCE_MS]
  );

  const handleAdjustQuantity = useCallback(
    (item: InventoryItem, delta: 1 | -1) => {
      if (adjustingItemIds.has(item.id)) return;

      const current = queryClient.getQueryData<InventoryItemsResponse>(inventoryListQueryKey);
      const cachedItem = current?.items.find((entry) => entry.id === item.id);
      const existingPending = pendingQuantityRef.current.get(item.id);
      const currentQty = existingPending?.targetQuantity ?? cachedItem?.quantity ?? item.quantity;

      if (delta === -1 && currentQty <= 0) return;

      const targetQuantity = Math.max(0, currentQty + delta);

      if (!existingPending) {
        pendingQuantityRef.current.set(item.id, {
          baselineQuantity: cachedItem?.quantity ?? item.quantity,
          targetQuantity,
          timerId: null,
        });
      } else {
        existingPending.targetQuantity = targetQuantity;
      }

      setItemQuantityInCache(item.id, targetQuantity);
      scheduleQuantityPersist(item.id);
    },
    [adjustingItemIds, queryClient, inventoryListQueryKey, setItemQuantityInCache, scheduleQuantityPersist]
  );

  const openEditItem = (item: InventoryItem) => {
    cancelAllPendingUploads();
    setItemNumberCheck({ status: 'idle' });
    setEditingItem(item);
    form.reset({
      itemName: item.itemName,
      itemNumber: item.itemNumber || '',
      uniqueCode: item.uniqueCode || '',
      quantity: item.quantity,
      location: item.location,
      unitOfMeasure: normalizeUnitForForm(item.unitOfMeasure || ''),
      partImages: item.partImages || [],
      brand: item.brand || '',
      description: item.description || '',
      buyingPrice: item.buyingPrice,
      mrp: item.mrp,
      supplier: item.supplier || '',
      billingDate: isoOrStoredDateToDdMmYyyy(item.billingDate),
      billImages: item.billImages || [],
    });
    setFormOpen(true);
  };

  const attachImageToSavedItem = useCallback(
    (itemId: string, fieldName: 'partImages' | 'billImages', url: string) => {
      const run = backgroundAttachQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch(`/api/inventory/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageField: fieldName, url }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to attach uploaded image');
        });

      backgroundAttachQueueRef.current = run
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
          queryClient.invalidateQueries({ queryKey: ['inventory-overview'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : 'Uploaded image could not be attached');
        });
    },
    [queryClient]
  );

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
          sourceFile: file,
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
        const savedItemId = uploadTargetByTempIdRef.current.get(tempId);
        if (!canceledUploadIdsRef.current.has(tempId)) {
          if (savedItemId) {
            attachImageToSavedItem(savedItemId, fieldName, result.url);
          } else {
            const currentUrls = (form.getValues(fieldName) || []) as string[];
            form.setValue(fieldName, [...currentUrls, result.url], { shouldDirty: true });
          }
        }

        setPending((prev) => prev.filter((upload) => upload.tempId !== tempId));
        uploadTargetByTempIdRef.current.delete(tempId);
        canceledUploadIdsRef.current.delete(tempId);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        const savedItemId = uploadTargetByTempIdRef.current.get(tempId);
        uploadTargetByTempIdRef.current.delete(tempId);
        if (canceledUploadIdsRef.current.has(tempId)) {
          canceledUploadIdsRef.current.delete(tempId);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          return;
        }
        setPending((prev) => {
          const exists = prev.some((upload) => upload.tempId === tempId);
          if (!exists && previewUrl) URL.revokeObjectURL(previewUrl);
          return prev.map((upload) =>
            upload.tempId === tempId
              ? { ...upload, status: 'error', error: message }
              : upload
          );
        });
        toast.error(savedItemId ? `Item saved, but ${file.name} did not attach. ${message}` : message);
      }
    },
    [attachImageToSavedItem, form]
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

    if (validFiles.length > 0) {
      window.requestAnimationFrame(() => {
        if (kind === 'part') billUploadTriggerRef.current?.focus();
        else submitItemRef.current?.focus();
      });
    }

    if (kind === 'part' && partInputRef.current) partInputRef.current.value = '';
    if (kind === 'part' && partCameraInputRef.current) partCameraInputRef.current.value = '';
    if (kind === 'bill' && billInputRef.current) billInputRef.current.value = '';
    if (kind === 'bill' && billCameraInputRef.current) billCameraInputRef.current.value = '';
  };

  const removePendingUpload = (kind: UploadKind, tempId: string) => {
    const setPending = kind === 'part' ? setPendingPartUploads : setPendingBillUploads;
    canceledUploadIdsRef.current.add(tempId);
    uploadTargetByTempIdRef.current.delete(tempId);
    setPending((prev) => {
      const target = prev.find((upload) => upload.tempId === tempId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((upload) => upload.tempId !== tempId);
    });
  };

  const retryPendingUpload = (kind: UploadKind, tempId: string) => {
    const pendingUploads = kind === 'part' ? pendingPartUploads : pendingBillUploads;
    const upload = pendingUploads.find((item) => item.tempId === tempId);
    if (!upload) return;

    removePendingUpload(kind, tempId);
    window.setTimeout(() => {
      void uploadSingleFile(upload.sourceFile, kind);
    }, 0);
  };

  const removeImage = (fieldName: 'partImages' | 'billImages', url: string) => {
    const nextUrls = ((form.getValues(fieldName) || []) as string[]).filter((item) => item !== url);
    form.setValue(fieldName, nextUrls, { shouldDirty: true });
  };

  const hasItemNumberConflict = itemNumberCheck.status === 'duplicate';

  const onSubmit = (values: InventoryItemForm) => {
    if (hasItemNumberConflict) {
      toast.error('Item number already exists. Use a different one.');
      return;
    }
    pendingUploadIdsAtSubmitRef.current = new Set(
      [...pendingPartUploads, ...pendingBillUploads]
        .filter((upload) => upload.status !== 'error')
        .map((upload) => upload.tempId)
    );
    saveMutation.mutate(values);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`max-w-7xl mx-auto px-3 pt-4 sm:px-4 sm:pt-6 lg:px-8 space-y-4 sm:space-y-5 ${
        isOrderMode && orderStep === 'select' ? 'pb-28 sm:pb-24' : 'pb-6 sm:pb-6'
      } ${inventoryPointerClass}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-slate-900 p-2.5 text-white shadow-sm sm:p-3">
            <Boxes className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-gray-950 sm:text-3xl">Inventory Items</h1>
            <p className="truncate text-xs text-gray-500 sm:text-sm">
              {pagination?.total ?? stats.totalItems} products across {stats.locations.length} locations
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          {isOrderMode ? (
            <Button
              type="button"
              onClick={resetOrderFlow}
              variant="outline"
              className="h-10 flex-1 border-gray-300 sm:flex-initial"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <>
              <Button onClick={openNewItem} className="h-10 flex-1 bg-slate-900 text-white hover:bg-slate-800 sm:flex-initial">
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
              <Button
                type="button"
                onClick={startOrderFlow}
                variant="outline"
                className="h-10 flex-1 border-gray-300 sm:flex-initial"
              >
                <ClipboardList className="h-4 w-4" />
                Create Order
              </Button>
              <Button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                variant="outline"
                className="h-10 flex-1 border-gray-300 sm:flex-initial"
              >
                {downloadingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                {downloadingPdf ? 'Generating...' : 'PDF'}
              </Button>
            </>
          )}
        </div>
      </div>

      {orderStep === 'select' && (
        <div className="rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm sm:p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 sm:flex sm:overflow-x-auto">
              {statusTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={`flex min-w-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:px-3 ${
                    statusFilter === tab.value
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span className="truncate">{tab.label}</span>
                  <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 sm:ml-2 sm:px-2">
                    {tabCounts[tab.value]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search item, brand, code..."
                  className="h-10 pl-10 pr-9"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <kbd className="pointer-events-none hidden h-5 select-none items-center rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-medium text-gray-400 sm:inline-flex">
                      /
                    </kbd>
                  )}
                </div>
              </div>
              <div className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-500">
                <Filter className="h-4 w-4" />
                {isFetching ? 'Refreshing' : `${items.length} shown`}
              </div>
            </div>
          </div>
        </div>
      )}

      {isOrderMode && orderStep === 'review' ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-950">Review & Quantities</h2>
              <p className="text-sm text-gray-500">{selectedOrderItemsList.length} items selected</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-gray-300"
              onClick={() => setOrderStep('select')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>

          {selectedOrderItemsList.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Package className="mx-auto h-10 w-10 text-gray-300" strokeWidth={1.2} />
              <h3 className="mt-3 text-base font-semibold text-gray-900">No selected items</h3>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-gray-300"
                onClick={() => setOrderStep('select')}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="border-b border-gray-200 bg-white text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="w-12 px-4 py-3">#</th>
                      <th className="px-4 py-3">Item Name</th>
                      <th className="w-40 px-4 py-3">SKU</th>
                      <th className="w-40 px-4 py-3">Brand</th>
                      <th className="w-44 px-4 py-3">Qty to Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedOrderItemsList.map((item, index) => (
                      <tr key={item.id} className="bg-white">
                        <td className="px-4 py-3 text-sm font-medium text-gray-500">{index + 1}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-md truncate font-medium text-gray-950" title={item.itemName}>
                            {item.itemName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{item.itemNumber || item.uniqueCode || '-'}</td>
                        <td className="px-4 py-3 text-gray-700">{item.brand || '-'}</td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="1"
                            value={orderQuantities[item.id] || ''}
                            onChange={(event) => updateOrderQuantity(item.id, event.target.value)}
                            className="h-9 w-32"
                            aria-label={`Quantity to order for ${item.itemName}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 border-t border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  onClick={handleDownloadOrderPdf}
                  disabled={downloadingOrderPdf}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {downloadingOrderPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {downloadingOrderPdf ? 'Generating...' : 'Download PDF'}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-80 rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white px-4 py-16 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-300" strokeWidth={1.2} />
              <h2 className="mt-4 text-lg font-semibold text-gray-900">No inventory items found</h2>
              <p className="mt-2 text-sm text-gray-500">Add your first stock item or clear the current filters.</p>
              {!isOrderMode && (
                <Button onClick={openNewItem} className="mt-5 bg-slate-900 text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
                  onAdjustQuantity={handleAdjustQuantity}
                  isAdjusting={adjustingItemIds.has(item.id)}
                  isOrderMode={isOrderMode}
                  isSelected={selectedOrderIds.has(item.id)}
                  onToggleOrderSelection={toggleOrderSelection}
                />
              ))}
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-lg border border-gray-200 bg-white px-2 py-2 sm:px-3 sm:py-3">
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 border-gray-300 p-0 sm:w-auto sm:px-3"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <div className="min-w-0 overflow-x-auto hide-scrollbar">
                <div className="mx-auto flex w-max items-center gap-1 px-1">
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
                        className={`h-9 min-w-9 px-3 ${
                          currentPage === page
                            ? 'bg-slate-900 text-white hover:bg-slate-800'
                            : 'border-gray-300'
                        }`}
                        onClick={() => setCurrentPage(page)}
                        aria-current={currentPage === page ? 'page' : undefined}
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 border-gray-300 p-0 sm:w-auto sm:px-3"
                disabled={currentPage >= pagination.totalPages}
                onClick={() => setCurrentPage((page) => Math.min(page + 1, pagination.totalPages))}
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4 sm:hidden" />
              </Button>
            </div>
          )}
        </>
      )}

      {isOrderMode && orderStep === 'select' && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900">
              <CheckSquare className="h-4 w-4 text-slate-700" />
              <span>{selectedOrderCount} item{selectedOrderCount === 1 ? '' : 's'} selected</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-gray-300"
                onClick={resetOrderFlow}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 bg-slate-900 text-white hover:bg-slate-800"
                disabled={selectedOrderCount === 0}
                onClick={continueToOrderReview}
              >
                Continue
              </Button>
            </div>
          </div>
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
            setUploadPromptKind(null);
          }
        }}
      >
        <DialogContent
          className={`flex max-h-[min(90vh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl ${inventoryPointerClass}`}
        >
          <DialogHeader className="shrink-0 space-y-1 border-b-4 border-black px-6 py-5 pr-14 text-left">
            <DialogTitle className="text-xl font-semibold text-[#111111]">
              {editingItem ? 'Edit inventory item' : 'Add inventory item'}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#555555]">
              Capture quantity, location, buying code, pricing and bills in one place.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              onKeyDown={handleInventoryFormKeyDown}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-gutter:stable]">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="itemName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Brake pad set"
                          {...field}
                          value={field.value || ''}
                          ref={(node) => {
                            field.ref(node);
                            itemNameInputRef.current = node;
                          }}
                        />
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
                      <FormLabel>
                        Item number <span className="text-xs font-normal text-gray-400">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="BP-204"
                            {...field}
                            value={field.value || ''}
                            ref={(node) => {
                              field.ref(node);
                              itemNumberInputRef.current = node;
                            }}
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
                        <Input
                          placeholder="Bosch"
                          {...field}
                          value={field.value || ''}
                          ref={(node) => {
                            field.ref(node);
                            brandInputRef.current = node;
                          }}
                        />
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
                        <Input
                          placeholder="Shop code written on product"
                          {...field}
                          value={field.value || ''}
                          ref={(node) => {
                            field.ref(node);
                            uniqueCodeInputRef.current = node;
                          }}
                        />
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
                          ref={(node) => {
                            field.ref(node);
                            quantityInputRef.current = node;
                          }}
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        onOpenChange={(open) => {
                          if (open) unitSkipAdvanceFocusRef.current = false;
                        }}
                      >
                        <FormControl>
                          <SelectTrigger
                            ref={(node) => {
                              unitSelectTriggerRef.current = node;
                            }}
                          >
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent
                          onEscapeKeyDown={() => {
                            unitSkipAdvanceFocusRef.current = true;
                          }}
                          onPointerDownOutside={() => {
                            unitSkipAdvanceFocusRef.current = true;
                          }}
                          onCloseAutoFocus={(e) => {
                            if (unitSkipAdvanceFocusRef.current) {
                              e.preventDefault();
                              unitSkipAdvanceFocusRef.current = false;
                              return;
                            }
                            e.preventDefault();
                            window.requestAnimationFrame(() =>
                              locationInputRef.current?.focus()
                            );
                          }}
                        >
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
                        <Input
                          placeholder="Rack A / Godown 1"
                          {...field}
                          value={field.value || ''}
                          ref={(node) => {
                            field.ref(node);
                            locationInputRef.current = node;
                          }}
                        />
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
                        <Input
                          placeholder="Supplier name"
                          {...field}
                          value={field.value || ''}
                          ref={(node) => {
                            field.ref(node);
                            supplierInputRef.current = node;
                          }}
                        />
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
                          ref={(node) => {
                            field.ref(node);
                            buyingPriceInputRef.current = node;
                          }}
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
                          ref={(node) => {
                            field.ref(node);
                            mrpInputRef.current = node;
                          }}
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
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="DD/MM/YYYY"
                          autoComplete="off"
                          {...field}
                          value={field.value || ''}
                          ref={(node) => {
                            field.ref(node);
                            billingDateInputRef.current = node;
                          }}
                          onChange={(event) =>
                            field.onChange(formatBillingDateMask(event.target.value))
                          }
                        />
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
                      <Textarea
                        rows={3}
                        placeholder="Fitment, notes, model compatibility..."
                        {...field}
                        value={field.value || ''}
                        ref={(node) => {
                          field.ref(node);
                          descriptionInputRef.current = node;
                        }}
                      />
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
                        Photos help identify stock faster.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-300"
                      ref={partUploadTriggerRef}
                      disabled={saveMutation.isPending}
                      onClick={() => setUploadPromptKind('part')}
                    >
                      <ImagePlus className="h-4 w-4" />
                      Upload
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
                  <input
                    ref={partCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
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
                              className="absolute right-1 top-1 cursor-pointer rounded-full bg-white p-1 text-gray-600 shadow-sm hover:text-red-600"
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
                            {upload.status === 'error' && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-500/70 px-2 text-center text-white">
                                <AlertTriangle className="h-5 w-5" />
                                <span className="line-clamp-2 text-[10px] font-semibold">{upload.error || 'Failed'}</span>
                                <button
                                  type="button"
                                  onClick={() => retryPendingUpload('part', upload.tempId)}
                                  className="mt-1 rounded bg-white px-2 py-1 text-[10px] font-bold text-red-700 shadow-sm"
                                >
                                  Retry
                                </button>
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
                        Attach purchase bill images or PDFs.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-gray-300"
                      ref={billUploadTriggerRef}
                      disabled={saveMutation.isPending}
                      onClick={() => setUploadPromptKind('bill')}
                    >
                      <Upload className="h-4 w-4" />
                      Upload
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
                  <input
                    ref={billCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
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
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{upload.fileName}</p>
                              <p className={`truncate text-xs ${upload.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                                {upload.status === 'error'
                                  ? upload.error || 'Upload failed'
                                  : upload.isImage
                                    ? 'Photo selected'
                                    : 'File selected'}
                              </p>
                            </div>
                            {upload.status === 'error' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => retryPendingUpload('bill', upload.tempId)}
                                className="h-8 border-red-200 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                              >
                                Retry
                              </Button>
                            )}
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

              </div>

              <DialogFooter className="shrink-0 flex-col gap-2 border-t border-[#E5E5E5] bg-[#FFFFFF] px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
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
                  ref={submitItemRef}
                  disabled={
                    saveMutation.isPending ||
                    hasItemNumberConflict ||
                    itemNumberCheck.status === 'checking'
                  }
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {saveMutation.isPending
                    ? 'Saving...'
                    : editingItem
                      ? 'Update Item'
                      : 'Add Item'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadPromptKind !== null}
        onOpenChange={(open) => {
          if (!open) setUploadPromptKind(null);
        }}
      >
        <DialogContent className={`sm:max-w-sm ${inventoryPointerClass}`}>
          <DialogHeader>
            <DialogTitle>{uploadPromptKind === 'part' ? 'Part images' : 'Bill images'}</DialogTitle>
            <DialogDescription>
              {uploadPromptKind === 'part'
                ? 'Add part photos now, or skip and continue without images.'
                : 'Attach bill photos or PDFs now, or skip and continue.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-gray-300"
              onClick={() => {
                const kind = uploadPromptKind;
                setUploadPromptKind(null);
                window.requestAnimationFrame(() => {
                  if (kind === 'part') billUploadTriggerRef.current?.focus();
                  else submitItemRef.current?.focus();
                });
              }}
            >
              Skip
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-gray-300 sm:hidden"
              disabled={saveMutation.isPending}
              onClick={() => {
                const kind = uploadPromptKind;
                if (kind === 'part') partCameraInputRef.current?.click();
                else billCameraInputRef.current?.click();
                setUploadPromptKind(null);
              }}
            >
              <Camera className="h-4 w-4" />
              Camera
            </Button>
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800 sm:hidden"
              disabled={saveMutation.isPending}
              onClick={() => {
                const kind = uploadPromptKind;
                if (kind === 'part') partInputRef.current?.click();
                else billInputRef.current?.click();
                setUploadPromptKind(null);
              }}
            >
              <Upload className="h-4 w-4" />
              Gallery
            </Button>
            <Button
              type="button"
              className="hidden bg-slate-900 text-white hover:bg-slate-800 sm:inline-flex"
              disabled={saveMutation.isPending}
              onClick={() => {
                const kind = uploadPromptKind;
                if (kind === 'part') partInputRef.current?.click();
                else billInputRef.current?.click();
                setUploadPromptKind(null);
              }}
            >
              Choose files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className={inventoryPointerClass}>
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
