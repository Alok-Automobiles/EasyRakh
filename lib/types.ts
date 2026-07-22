export interface User {
  _id?: string;
  email: string;
  password: string;
  name: string;
  firmTitle?: string;
  gstNumber?: string;
  firmPhone?: string;
  firmEmail?: string;
  firmAddress?: string;
  lastLoginAt?: Date;
  lastActiveAt?: Date;
  loginCount?: number;
  createdAt: Date;
}

export interface Customer {
  _id?: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  balanceType: 'credit' | 'debit';
  openingBalanceDescription?: string;
  openingBalanceBillUrl?: string;
  openingBalanceBillPublicId?: string;
  searchTokens?: string[];
  createdAt: Date;
}

export interface Supplier {
  _id?: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  balanceType: 'credit' | 'debit';
  openingBalanceDescription?: string;
  openingBalanceBillUrl?: string;
  openingBalanceBillPublicId?: string;
  searchTokens?: string[];
  createdAt: Date;
}

export interface CollectionType {
  _id?: string;
  userId: string;
  name: string;
  slug: string; // URL-safe identifier, unique per user
  createdAt: Date;
}

export interface CustomEntity {
  _id?: string;
  userId: string;
  collectionType: string; // slug of the collection type
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  balanceType: 'credit' | 'debit';
  openingBalanceDescription?: string;
  openingBalanceBillUrl?: string;
  openingBalanceBillPublicId?: string;
  searchTokens?: string[];
  createdAt: Date;
}

export interface Transaction {
  _id?: string;
  userId: string;
  customerId?: string;
  supplierId?: string;
  entityType: 'customer' | 'supplier' | string; // string allows custom entity types
  entityId: string;
  type: 'credit' | 'debit';
  amount: number;
  description?: string;
  billUrl?: string;
  billPublicId?: string;
  date: Date;
  createdAt: Date;
}

export interface RecentActivity {
  id: string;
  type: 'transaction' | 'customer_created' | 'supplier_created' | 'custom_entity_created';
  entityName: string;
  description: string;
  amount?: number;
  transactionType?: 'credit' | 'debit';
  entityType?: 'customer' | 'supplier' | string;
  entityId?: string;
  date: Date;
  createdAt: Date;
}

export interface LedgerEntry {
  date: Date;
  description: string;
  credit: number;
  debit: number;
  balance: number;
  billUrl?: string;
  billPublicId?: string;
  transactionId?: string;
}

export interface Note {
  _id?: string;
  userId: string;
  title: string;
  content?: string;
  color: string;
  isFavorite?: boolean;
  showOnDashboard?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id?: string;
  inventoryItemId?: string;
  itemNumber?: string;
  itemName: string;
  quantity: number;
  /** Legacy/current line total. Preserved for backward compatibility. */
  amount: number;
  unitPrice?: number;
  lineTotal?: number;
  unitCost?: number;
  cogs?: number;
  grossProfit?: number;
  costStatus?: 'complete' | 'missing';
  costSource?: 'inventory_snapshot' | 'entered' | 'legacy_backfill';
}

export interface InvoicePayment {
  id: string;
  idempotencyKey?: string;
  amount: number;
  date: Date;
  dailyCashEntryId?: string;
  ledgerTransactionId?: string;
  source: 'initial' | 'added' | 'legacy';
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceSellerSnapshot {
  firmTitle: string;
  gstNumber: string;
  firmPhone: string;
  firmEmail: string;
  firmAddress: string;
}

export interface Invoice {
  _id?: string;
  userId: string;
  invoiceNumber: string; // e.g., INV-2026-01-0001
  customerId?: string; // linked customer if exists
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  totalAmount: number;
  totalCogs?: number;
  costedSales?: number;
  uncostedSales?: number;
  missingCostItemCount?: number;
  grossProfit?: number;
  grossMargin?: number;
  pricingVersion?: number;
  paidAmount: number;
  payments?: InvoicePayment[];
  status: 'paid' | 'unpaid' | 'partial';
  notes?: string;
  addedToLedger: boolean;
  transactionId?: string; // linked transaction if added to ledger
  sellerSnapshot?: InvoiceSellerSnapshot;
  pdfUrl?: string;
  pdfPublicId?: string;
  pdfStatus?: 'ready' | 'missing' | 'failed';
  pdfUpdatedAt?: Date;
  searchTokens?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryItem {
  _id?: string;
  userId: string;
  itemName: string;
  itemNumber?: string;
  uniqueCode?: string;
  quantity: number;
  location: string;
  unitOfMeasure: string;
  partImages?: string[];
  partImagePublicIds?: string[];
  brand?: string;
  description?: string;
  buyingPrice?: number;
  mrp?: number;
  supplier?: string;
  billingDate?: Date;
  billImages?: string[];
  billImagePublicIds?: string[];
  itemNumberKey?: string;
  searchTokens?: string[];
  fuzzySearchTokens?: string[];
  stockStatus?: 'in-stock' | 'low-stock' | 'out-of-stock' | 'inactive';
  lastQuantityUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryStats {
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  outOfStockItems: number;
  inactiveItems: number;
  restockItems: number;
  lowStockThreshold: number;
  locations: string[];
  brands: string[];
  suppliers: string[];
}
