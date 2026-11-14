import { ObjectId, type Db, type ClientSession } from 'mongodb';
import { timeStage } from './request-timing';
import type { CustomEntity, Customer, InventoryItem, Supplier, Transaction } from './types';
import {
  LOW_STOCK_THRESHOLD,
  getInactiveCutoff,
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

  // MongoDB forbids parallel operations on one transaction session. Keep the
  // original parallel reads for standalone backfills and benchmark baselines.
  const [customers, suppliers, customEntities, transactions, inventoryItems] = session
    ? [
        await customersCollection.find({ userId }, { session }).toArray(),
        await suppliersCollection.find({ userId }, { session }).toArray(),
        await customEntitiesCollection.find({ userId }, { session }).toArray(),
        await transactionsCollection.find({ userId }, { session }).toArray(),
        await inventoryCollection.find({ userId }, { session }).toArray(),
      ] as const
    : await Promise.all([
        customersCollection.find({ userId }).toArray(),
        suppliersCollection.find({ userId }).toArray(),
        customEntitiesCollection.find({ userId }).toArray(),
        transactionsCollection.find({ userId }).toArray(),
        inventoryCollection.find({ userId }).toArray(),
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
  const rebuilt = await refreshUserReadModels(db, userId);
  if (!rebuilt) throw new Error('Read models unavailable');
  return rebuilt;
}

export type ReadModelChanges = {
  entities?: Array<{ entityType: string; entityId: string | undefined }>;
  inventory?: boolean;
};

/** Re-read authoritative rows, rather than applying caller-provided money deltas.
 * Retried refreshes are idempotent. The per-user write makes concurrent snapshots
 * conflict and retry, preventing one refresh from overwriting another's totals.
 */
export async function refreshUserReadModels(
  db: Db, userId: string, changes?: ReadModelChanges,
): Promise<UserSummary | null> {
  return timeStage('summary', async () => {
    let session: ClientSession | undefined;
    try {
      session = db.client.startSession();
      const activeSession = session;
      return await activeSession.withTransaction(async () => {
        const session = activeSession;
        await db.collection('users').updateOne(
          { _id: new ObjectId(userId) }, { $inc: { readModelRevision: 1 } }, { session },
        );
        const existing = await db.collection<UserSummary>('userSummaries').findOne({ userId }, { session });
        if (!existing || !changes) return rebuildUserReadModels(db, userId, { session });
        const now = new Date();
        const summary = { ...existing, updatedAt: now };
        const balances = db.collection<EntityBalance>('entityBalances');
        const unique = new Map((changes.entities || [])
          .filter((entity) => entity.entityId)
          .map((entity) => [balanceKey(entity.entityType, entity.entityId!), entity]));
        for (const { entityType, entityId } of unique.values()) {
          const filter = { userId, entityType, entityId: entityId! };
          const previous = await balances.findOne(filter, { session });
          const collection = entityType === 'customer' ? 'customers'
            : entityType === 'supplier' ? 'suppliers' : 'customEntities';
          const entity = await db.collection(collection).findOne({
            userId, _id: new ObjectId(entityId!),
            ...(collection === 'customEntities' ? { collectionType: entityType } : {}),
          }, { session });
          // Include pre-entityType ledger records, with the same precedence as
          // rebuildUserReadModels. The initial match uses the user/entity indexes.
          const candidates = [{ entityId }, ...(entityType === 'customer' ? [{ customerId: entityId }]
            : entityType === 'supplier' ? [{ supplierId: entityId }] : [])];
          const [totals] = await db.collection('transactions').aggregate<{
            credit: number; debit: number; count: number; lastDate?: Date;
          }>([
            { $match: { userId, $or: candidates } },
            { $set: {
              resolvedType: { $cond: [{ $toBool: '$entityType' }, '$entityType',
                { $cond: [{ $toBool: '$customerId' }, 'customer', 'supplier'] }] },
              resolvedId: { $cond: [{ $toBool: '$entityId' }, '$entityId',
                { $cond: [{ $toBool: '$customerId' }, '$customerId', '$supplierId'] }] },
            } },
            { $match: { resolvedType: entityType, resolvedId: entityId } },
            { $group: { _id: null,
              credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, { $ifNull: ['$amount', 0] }, 0] } },
              debit: { $sum: { $cond: [{ $ne: ['$type', 'credit'] }, { $ifNull: ['$amount', 0] }, 0] } },
              count: { $sum: 1 }, lastDate: { $max: '$date' },
            } },
          ], { session }).toArray();
          const next = entity || totals?.count
            ? makeBalanceDoc(userId, entityType, entityId!, entity || { name: 'Unknown' }, now) : null;
          if (next) {
            next.createdAt = previous?.createdAt || now;
            next.totalCredit = totals?.credit || 0;
            next.totalDebit = totals?.debit || 0;
            next.transactionCount = totals?.count || 0;
            if (totals?.lastDate) next.lastTransactionDate = totals.lastDate;
            next.totalBalance = next.openingBalanceSigned - next.totalCredit + next.totalDebit;
            await balances.replaceOne(filter, next, { session, upsert: true });
          } else {
            await balances.deleteOne(filter, { session });
          }
          const creditDelta = (next?.totalCredit || 0) - (previous?.totalCredit || 0);
          const debitDelta = (next?.totalDebit || 0) - (previous?.totalDebit || 0);
          summary.totalCredit += creditDelta;
          summary.totalDebit += debitDelta;
          summary.totalTransactions += (next?.transactionCount || 0) - (previous?.transactionCount || 0);
          if (entityType === 'customer' || entityType === 'supplier') {
            summary[entityType === 'customer' ? 'customerCredit' : 'supplierCredit'] += creditDelta;
            summary[entityType === 'customer' ? 'customerDebit' : 'supplierDebit'] += debitDelta;
            summary[entityType === 'customer' ? 'customerOpeningBalanceTotal' : 'supplierOpeningBalanceTotal'] +=
              (next?.openingBalanceSigned || 0) - (previous?.openingBalanceSigned || 0);
            summary[entityType === 'customer' ? 'totalCustomers' : 'totalSuppliers'] =
              await db.collection(collection).countDocuments({ userId }, { session });
          }
        }
        if (changes.inventory) summary.inventory = await aggregateInventorySummary(db, userId, session, now);
        // Do not pass the driver's _id back as a replacement field.
        await db.collection<UserSummary>('userSummaries').updateOne({ userId }, { $set: {
          totalCredit: summary.totalCredit, totalDebit: summary.totalDebit,
          totalTransactions: summary.totalTransactions,
          customerCredit: summary.customerCredit, customerDebit: summary.customerDebit,
          supplierCredit: summary.supplierCredit, supplierDebit: summary.supplierDebit,
          customerOpeningBalanceTotal: summary.customerOpeningBalanceTotal,
          supplierOpeningBalanceTotal: summary.supplierOpeningBalanceTotal,
          totalCustomers: summary.totalCustomers, totalSuppliers: summary.totalSuppliers,
          ...(changes.inventory ? { inventory: summary.inventory } : {}), updatedAt: now,
        } }, { session });
        return summary;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      console.warn('Read model refresh failed', error instanceof Error ? error.name : 'UnknownError');
      return null;
    } finally { await session?.endSession(); }
  });
}

// Inventory-only writes no longer read any ledger or entity collections. Reduce
// on the database so payload/memory use does not grow with the inventory size.
async function aggregateInventorySummary(db: Db, userId: string, session: ClientSession, now: Date) {
  const quantity = { $ifNull: ['$quantity', 0] };
  const quantityDate = { $ifNull: ['$lastQuantityUpdatedAt', { $ifNull: ['$createdAt', new Date(0)] }] };
  const zero = { $lte: [quantity, 0] };
  const [row] = await db.collection('inventory').aggregate([
    { $match: { userId } },
    { $group: { _id: null, totalItems: { $sum: 1 }, totalQuantity: { $sum: quantity },
      totalValue: { $sum: { $multiply: [quantity, { $ifNull: ['$buyingPrice', 0] }] } },
      restockItems: { $sum: { $cond: [{ $and: [{ $gt: [quantity, 0] }, { $lte: [quantity, LOW_STOCK_THRESHOLD] }] }, 1, 0] } },
      outOfStockItems: { $sum: { $cond: [{ $and: [zero, { $gt: [quantityDate, getInactiveCutoff(now)] }] }, 1, 0] } },
      inactiveItems: { $sum: { $cond: [{ $and: [zero, { $lte: [quantityDate, getInactiveCutoff(now)] }] }, 1, 0] } },
      locations: { $addToSet: '$location' }, brands: { $addToSet: '$brand' }, suppliers: { $addToSet: '$supplier' },
    } },
  ], { session }).toArray();
  return {
    totalItems: row?.totalItems || 0, totalQuantity: row?.totalQuantity || 0,
    totalValue: row?.totalValue || 0, outOfStockItems: row?.outOfStockItems || 0,
    inactiveItems: row?.inactiveItems || 0, restockItems: row?.restockItems || 0,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    locations: (row?.locations || []).filter(Boolean).sort() as string[],
    brands: (row?.brands || []).filter(Boolean).sort() as string[],
    suppliers: (row?.suppliers || []).filter(Boolean).sort() as string[],
  };
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
