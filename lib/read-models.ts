import { ObjectId, type Db, type ClientSession, type Document } from 'mongodb';
import type { CustomEntity, Customer, InventoryItem, Supplier, Transaction } from './types';
import {
  LOW_STOCK_THRESHOLD,
  entitySearchTokens,
  getInventoryStockStatus,
  inventorySearchTokens,
  normalizeIdentifier,
  searchIdentifierValues,
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
  sourcePresent?: boolean;
  totalCredit: number;
  totalDebit: number;
  totalBalance: number;
  transactionCount: number;
  lastTransactionDate?: Date;
  searchTokens: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface InventoryReadModelItem {
  userId: string;
  itemId: string;
  quantity: number;
  value: number;
  outOfStock: number;
  inactive: number;
  restock: number;
  location: string;
  brand: string;
  supplier: string;
}

export interface ReadModelEntityKey {
  entityType: string;
  entityId: string;
}

export interface ReadModelChanges {
  entities?: ReadModelEntityKey[];
  inventoryItemIds?: string[];
}

export interface UserSummary {
  userId: string;
  readModelVersion?: number;
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
    sourcePresent: entityName !== 'Unknown' || Boolean(entity._id),
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

function inventoryReadModelItem(userId: string, item: InventoryItem & { _id: { toString(): string } }): InventoryReadModelItem {
  const status = getInventoryStockStatus(item);
  const quantity = item.quantity || 0;
  return {
    userId,
    itemId: item._id.toString(),
    quantity,
    value: quantity * (item.buyingPrice || 0),
    outOfStock: Number(status === 'out-of-stock'),
    inactive: Number(status === 'inactive'),
    restock: Number(status === 'low-stock'),
    location: item.location || '',
    brand: item.brand || '',
    supplier: item.supplier || '',
  };
}

export function emptyUserSummary(userId: string, now = new Date()): UserSummary {
  return {
    userId,
    readModelVersion: 2,
    totalCredit: 0,
    totalDebit: 0,
    totalTransactions: 0,
    customerCredit: 0,
    customerDebit: 0,
    supplierCredit: 0,
    supplierDebit: 0,
    totalCustomers: 0,
    totalSuppliers: 0,
    customerOpeningBalanceTotal: 0,
    supplierOpeningBalanceTotal: 0,
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
  const inventoryReadModelCollection = db.collection<InventoryReadModelItem>('inventoryReadModelItems');
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

  const summary: UserSummary = emptyUserSummary(userId, now);
  summary.totalTransactions = transactions.length;
  summary.totalCustomers = customers.length;
  summary.totalSuppliers = suppliers.length;
  summary.customerOpeningBalanceTotal = customers.reduce((sum, entity) => sum + signedOpeningBalance(entity), 0);
  summary.supplierOpeningBalanceTotal = suppliers.reduce((sum, entity) => sum + signedOpeningBalance(entity), 0);

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

  await inventoryReadModelCollection.deleteMany({ userId }, { session });
  if (inventoryItems.length > 0) {
    await inventoryReadModelCollection.insertMany(
      inventoryItems.map((item) => inventoryReadModelItem(userId, item as InventoryItem & { _id: { toString(): string } })),
      { session, ordered: false }
    );
  }

  await userSummariesCollection.replaceOne({ userId }, summary, { session, upsert: true });
  return summary;
}

function effectiveTransactionMatch(entityType: string, entityId: string): Document[] {
  const candidates: Document[] = [{ entityId }];
  if (entityType === 'customer') candidates.push({ customerId: entityId });
  if (entityType === 'supplier') candidates.push({ supplierId: entityId });
  return [
    { $match: { $or: candidates } },
    { $addFields: {
      _readModelEntityType: { $ifNull: ['$entityType', { $cond: [{ $ifNull: ['$customerId', false] }, 'customer', 'supplier'] }] },
      _readModelEntityId: { $ifNull: ['$entityId', { $ifNull: ['$customerId', '$supplierId'] }] },
    } },
    { $match: { _readModelEntityType: entityType, _readModelEntityId: entityId } },
  ];
}

async function currentEntityBalance(
  db: Db,
  userId: string,
  key: ReadModelEntityKey,
  session: ClientSession,
  now: Date
): Promise<EntityBalance | null> {
  const { entityType, entityId } = key;
  const collectionName = entityType === 'customer' ? 'customers' : entityType === 'supplier' ? 'suppliers' : 'customEntities';
  const objectId = ObjectId.isValid(entityId) ? new ObjectId(entityId) : null;
  const entity = objectId
    ? await db.collection(collectionName).findOne({ _id: objectId, userId, ...(collectionName === 'customEntities' ? { collectionType: entityType } : {}) }, { session })
    : null;
  const [totals] = await db.collection('transactions').aggregate<{
    totalCredit: number;
    totalDebit: number;
    transactionCount: number;
    lastTransactionDate?: Date;
  }>([
    { $match: { userId } },
    ...effectiveTransactionMatch(entityType, entityId),
    { $group: {
      _id: null,
      totalCredit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amount', 0] }, 0] } },
      totalDebit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, 0, { $ifNull: ['$amount', 0] }] } },
      transactionCount: { $sum: 1 },
      lastTransactionDate: { $max: '$date' },
    } },
  ], { session }).toArray();
  if (!entity && !totals) return null;
  const balance = makeBalanceDoc(userId, entityType, entityId, entity || { name: 'Unknown', openingBalance: 0, balanceType: 'debit' }, now);
  balance.sourcePresent = Boolean(entity);
  balance.totalCredit = totals?.totalCredit || 0;
  balance.totalDebit = totals?.totalDebit || 0;
  balance.transactionCount = totals?.transactionCount || 0;
  balance.totalBalance = balance.openingBalanceSigned - balance.totalCredit + balance.totalDebit;
  if (totals?.lastTransactionDate) balance.lastTransactionDate = totals.lastTransactionDate;
  return balance;
}

function applyBalanceDifference(summary: UserSummary, previous: EntityBalance | null, current: EntityBalance | null, entityType: string) {
  const delta = (field: keyof EntityBalance) => Number(current?.[field] || 0) - Number(previous?.[field] || 0);
  summary.totalCredit += delta('totalCredit');
  summary.totalDebit += delta('totalDebit');
  summary.totalTransactions += delta('transactionCount');
  if (entityType === 'customer') {
    summary.customerCredit += delta('totalCredit');
    summary.customerDebit += delta('totalDebit');
    summary.totalCustomers += Number(Boolean(current?.sourcePresent)) - Number(Boolean(previous && (previous.sourcePresent ?? previous.entityName !== 'Unknown')));
    summary.customerOpeningBalanceTotal += delta('openingBalanceSigned');
  } else if (entityType === 'supplier') {
    summary.supplierCredit += delta('totalCredit');
    summary.supplierDebit += delta('totalDebit');
    summary.totalSuppliers += Number(Boolean(current?.sourcePresent)) - Number(Boolean(previous && (previous.sourcePresent ?? previous.entityName !== 'Unknown')));
    summary.supplierOpeningBalanceTotal += delta('openingBalanceSigned');
  }
}

async function syncInventoryItem(
  db: Db,
  userId: string,
  itemId: string,
  summary: UserSummary,
  session: ClientSession
) {
  const collection = db.collection<InventoryReadModelItem>('inventoryReadModelItems');
  const previous = await collection.findOne({ userId, itemId }, { session });
  const item = ObjectId.isValid(itemId)
    ? await db.collection('inventory').findOne({ _id: new ObjectId(itemId), userId }, { session })
    : null;
  const current = item ? inventoryReadModelItem(userId, item as unknown as InventoryItem & { _id: { toString(): string } }) : null;
  const delta = (field: keyof InventoryReadModelItem) => Number(current?.[field] || 0) - Number(previous?.[field] || 0);
  summary.inventory.totalItems += Number(Boolean(current)) - Number(Boolean(previous));
  summary.inventory.totalQuantity += delta('quantity');
  summary.inventory.totalValue += delta('value');
  summary.inventory.outOfStockItems += delta('outOfStock');
  summary.inventory.inactiveItems += delta('inactive');
  summary.inventory.restockItems += delta('restock');

  if (current) await collection.replaceOne({ userId, itemId }, current, { upsert: true, session });
  else if (previous) await collection.deleteOne({ userId, itemId }, { session });

  for (const field of ['location', 'brand', 'supplier'] as const) {
    const summaryField = field === 'location' ? 'locations' : field === 'brand' ? 'brands' : 'suppliers';
    const values = new Set(summary.inventory[summaryField]);
    if (current?.[field]) values.add(current[field]);
    if (previous?.[field] && previous[field] !== current?.[field]) {
      const other = await collection.findOne({ userId, [field]: previous[field] }, { session, projection: { _id: 1 } });
      if (!other) values.delete(previous[field]);
    }
    summary.inventory[summaryField] = [...values].sort();
  }
}

/** Refreshes only touched rows and writes balances plus their summary in one transaction. */
export async function syncAffectedReadModels(
  db: Db,
  userId: string,
  changes: ReadModelChanges,
  options: { session?: ClientSession } = {}
): Promise<UserSummary> {
  const entities = [...new Map((changes.entities || []).map((key) => [balanceKey(key.entityType, key.entityId), key])).values()];
  const inventoryItemIds = [...new Set(changes.inventoryItemIds || [])];
  const run = async (session: ClientSession) => {
    const now = new Date();
    const summaries = db.collection<UserSummary>('userSummaries');
    let summary: UserSummary | null = await summaries.findOne({ userId }, { session });
    if (!summary || summary.readModelVersion !== 2) {
      throw new Error(`Read model v2 missing for account; run the read-model backfill before deploying incremental writes`);
    }
    for (const key of entities) {
      const filter = { userId, entityType: key.entityType, entityId: key.entityId };
      const collection = db.collection<EntityBalance>('entityBalances');
      const previous = await collection.findOne(filter, { session });
      const current = await currentEntityBalance(db, userId, key, session, now);
      applyBalanceDifference(summary, previous, current, key.entityType);
      if (current) {
        current.createdAt = previous?.createdAt || now;
        await collection.replaceOne(filter, current, { upsert: true, session });
      } else if (previous) {
        await collection.deleteOne(filter, { session });
      }
    }
    for (const itemId of inventoryItemIds) await syncInventoryItem(db, userId, itemId, summary, session);
    summary.updatedAt = now;
    const { _id: _summaryId, ...summaryDocument } = summary as UserSummary & { _id?: ObjectId };
    void _summaryId;
    await summaries.replaceOne({ userId }, summaryDocument, { upsert: true, session });
    return summary;
  };
  if (options.session) return run(options.session);
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => run(session));
  } finally {
    await session.endSession();
  }
}

export async function ensureUserReadModels(db: Db, userId: string): Promise<UserSummary> {
  const userSummariesCollection = db.collection<UserSummary>('userSummaries');
  const existing = await userSummariesCollection.findOne({ userId });
  if (existing) return existing;
  return rebuildUserReadModels(db, userId);
}

/**
 * Compatibility entrypoint for write routes. New callers must declare what
 * changed so the bounded, transactional synchronizer can be used. The
 * full rebuild path remains for maintenance scripts and legacy repair only.
 */
export async function refreshUserReadModels(
  db: Db,
  userId: string,
  changes?: ReadModelChanges
): Promise<UserSummary | null> {
  try {
    if (changes) return await syncAffectedReadModels(db, userId, changes);
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
    searchIdentifiers: searchIdentifierValues(item.itemNumber, item.uniqueCode),
    stockStatus: getInventoryStockStatus({
      quantity: item.quantity || 0,
      lastQuantityUpdatedAt: item.lastQuantityUpdatedAt,
      createdAt: item.createdAt || new Date(),
    } as InventoryItem),
  };
}
