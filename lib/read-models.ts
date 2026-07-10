import type { Db, ClientSession } from 'mongodb';
import type { CustomEntity, Customer, InventoryItem, Supplier, Transaction } from './types';
import {
  LOW_STOCK_THRESHOLD,
  entitySearchTokens,
  getInventoryStockStatus,
  inventorySearchTokens,
  normalizeIdentifier,
} from './search-normalization';
import { inventoryFuzzyTokens } from './inventory-search';

export interface EntityBalance {
  userId: string;
  entityType: string;
  entityId: string;
  entityName: string;
  openingBalance: number;
  openingBalanceType: 'credit' | 'debit';
  openingBalanceSigned: number;
  totalCredit: number;
  totalDebit: number;
  totalBalance: number;
  transactionCount: number;
  lastTransactionDate?: Date;
  searchTokens: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSummary {
  userId: string;
  totalCredit: number;
  totalDebit: number;
  totalTransactions: number;
  customerCredit: number;
  customerDebit: number;
  supplierCredit: number;
  supplierDebit: number;
  totalCustomers: number;
  totalSuppliers: number;
  customerOpeningBalanceTotal: number;
  supplierOpeningBalanceTotal: number;
  inventory: {
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
  };
  updatedAt: Date;
}

function signedOpeningBalance(entity: {
  openingBalance?: number;
  balanceType?: 'credit' | 'debit';
}) {
  const openingBalance = entity.openingBalance || 0;
  return entity.balanceType === 'credit' ? -openingBalance : openingBalance;
}

function makeBalanceDoc(
  userId: string,
  entityType: string,
  entityId: string,
  entity: Customer | Supplier | CustomEntity | Record<string, unknown>,
  now: Date
): EntityBalance {
  const openingBalance = Number(entity.openingBalance || 0);
  const openingBalanceType = entity.balanceType === 'credit' ? 'credit' : 'debit';
  const openingBalanceSigned = openingBalanceType === 'credit' ? -openingBalance : openingBalance;
  const entityName = String(entity.name || 'Unknown');

  return {
    userId,
    entityType,
    entityId,
    entityName,
    openingBalance,
    openingBalanceType,
    openingBalanceSigned,
    totalCredit: 0,
    totalDebit: 0,
    totalBalance: openingBalanceSigned,
    transactionCount: 0,
    searchTokens: entitySearchTokens({
      name: entityName,
      phone: String(entity.phone || ''),
      email: String(entity.email || ''),
      collectionType: entityType,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

function balanceKey(entityType: string, entityId: string) {
  return `${entityType}:${entityId}`;
}

export async function rebuildUserReadModels(
  db: Db,
  userId: string,
  options: { session?: ClientSession } = {}
): Promise<UserSummary> {
  const now = new Date();
  const { session } = options;
  const customersCollection = db.collection<Customer>('customers');
  const suppliersCollection = db.collection<Supplier>('suppliers');
  const customEntitiesCollection = db.collection<CustomEntity>('customEntities');
  const transactionsCollection = db.collection<Transaction>('transactions');
  const inventoryCollection = db.collection<InventoryItem>('inventory');
  const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');
  const userSummariesCollection = db.collection<UserSummary>('userSummaries');

  const [customers, suppliers, customEntities, transactions, inventoryItems] = await Promise.all([
    customersCollection.find({ userId }, { session }).toArray(),
    suppliersCollection.find({ userId }, { session }).toArray(),
    customEntitiesCollection.find({ userId }, { session }).toArray(),
    transactionsCollection.find({ userId }, { session }).toArray(),
    inventoryCollection.find({ userId }, { session }).toArray(),
  ]);

  const balances = new Map<string, EntityBalance>();

  for (const customer of customers) {
    const id = customer._id!.toString();
    balances.set(balanceKey('customer', id), makeBalanceDoc(userId, 'customer', id, customer, now));
  }

  for (const supplier of suppliers) {
    const id = supplier._id!.toString();
    balances.set(balanceKey('supplier', id), makeBalanceDoc(userId, 'supplier', id, supplier, now));
  }

  for (const entity of customEntities) {
    const id = entity._id!.toString();
    balances.set(
      balanceKey(entity.collectionType, id),
      makeBalanceDoc(userId, entity.collectionType, id, entity, now)
    );
  }

  const summary: UserSummary = {
    userId,
    totalCredit: 0,
    totalDebit: 0,
    totalTransactions: transactions.length,
    customerCredit: 0,
    customerDebit: 0,
    supplierCredit: 0,
    supplierDebit: 0,
    totalCustomers: customers.length,
    totalSuppliers: suppliers.length,
    customerOpeningBalanceTotal: customers.reduce((sum, entity) => sum + signedOpeningBalance(entity), 0),
    supplierOpeningBalanceTotal: suppliers.reduce((sum, entity) => sum + signedOpeningBalance(entity), 0),
    inventory: {
      totalItems: 0,
      totalQuantity: 0,
      totalValue: 0,
      outOfStockItems: 0,
      inactiveItems: 0,
      restockItems: 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      locations: [],
      brands: [],
      suppliers: [],
    },
    updatedAt: now,
  };

  for (const transaction of transactions) {
    const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
    const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
    if (!entityId) continue;

    const key = balanceKey(entityType, entityId);
    let balance = balances.get(key);
    if (!balance) {
      balance = makeBalanceDoc(
        userId,
        entityType,
        entityId,
        { name: 'Unknown', openingBalance: 0, balanceType: 'debit' },
        now
      );
      balances.set(key, balance);
    }

    if (transaction.type === 'credit') {
      balance.totalCredit += transaction.amount || 0;
      summary.totalCredit += transaction.amount || 0;
      if (entityType === 'customer') summary.customerCredit += transaction.amount || 0;
      if (entityType === 'supplier') summary.supplierCredit += transaction.amount || 0;
    } else {
      balance.totalDebit += transaction.amount || 0;
      summary.totalDebit += transaction.amount || 0;
      if (entityType === 'customer') summary.customerDebit += transaction.amount || 0;
      if (entityType === 'supplier') summary.supplierDebit += transaction.amount || 0;
    }

    balance.transactionCount += 1;
    if (!balance.lastTransactionDate || transaction.date > balance.lastTransactionDate) {
      balance.lastTransactionDate = transaction.date;
    }
    balance.updatedAt = now;
  }

  for (const balance of balances.values()) {
    balance.totalBalance =
      balance.openingBalanceSigned - balance.totalCredit + balance.totalDebit;
  }

  const locations = new Set<string>();
  const brands = new Set<string>();
  const inventorySuppliers = new Set<string>();
  for (const item of inventoryItems) {
    const quantity = item.quantity || 0;
    summary.inventory.totalItems += 1;
    summary.inventory.totalQuantity += quantity;
    summary.inventory.totalValue += quantity * (item.buyingPrice || 0);
    if (item.location) locations.add(item.location);
    if (item.brand) brands.add(item.brand);
    if (item.supplier) inventorySuppliers.add(item.supplier);

    const stockStatus = getInventoryStockStatus(item);
    if (stockStatus === 'low-stock') summary.inventory.restockItems += 1;
    if (stockStatus === 'out-of-stock') summary.inventory.outOfStockItems += 1;
    if (stockStatus === 'inactive') summary.inventory.inactiveItems += 1;
  }
  summary.inventory.locations = Array.from(locations).sort();
  summary.inventory.brands = Array.from(brands).sort();
  summary.inventory.suppliers = Array.from(inventorySuppliers).sort();

  await entityBalancesCollection.deleteMany({ userId }, { session });
  const balanceDocs = Array.from(balances.values());
  if (balanceDocs.length > 0) {
    await entityBalancesCollection.insertMany(balanceDocs, { session, ordered: false });
  }

  await userSummariesCollection.replaceOne({ userId }, summary, { session, upsert: true });
  return summary;
}

export async function ensureUserReadModels(db: Db, userId: string): Promise<UserSummary> {
  const userSummariesCollection = db.collection<UserSummary>('userSummaries');
  const existing = await userSummariesCollection.findOne({ userId });
  if (existing) return existing;
  return rebuildUserReadModels(db, userId);
}

export async function refreshUserReadModels(db: Db, userId: string): Promise<UserSummary | null> {
  try {
    return await rebuildUserReadModels(db, userId);
  } catch (error) {
    console.warn(`Read model refresh failed for ${userId}:`, error);
    return null;
  }
}

export function inventoryDerivedFields(item: Partial<InventoryItem>) {
  return {
    itemNumberKey: normalizeIdentifier(item.itemNumber || ''),
    searchTokens: inventorySearchTokens(item),
    fuzzySearchTokens: inventoryFuzzyTokens(item),
    stockStatus: getInventoryStockStatus({
      quantity: item.quantity || 0,
      lastQuantityUpdatedAt: item.lastQuantityUpdatedAt,
      createdAt: item.createdAt || new Date(),
    } as InventoryItem),
  };
}
