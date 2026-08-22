import { MongoClient, type AnyBulkWriteOperation, type Filter } from 'mongodb';
import { entitySearchFields, invoiceSearchFields } from '../lib/search-normalization';
import { inventoryDerivedFields, rebuildUserReadModels } from '../lib/read-models';
import type { CustomEntity, Customer, InventoryItem, Invoice, Supplier } from '../lib/types';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI must be provided explicitly. This script never loads .env.local.');
  process.exit(1);
}

function mongoHostname(mongoUri: string): string {
  const withoutProtocol = mongoUri.replace(/^mongodb(?:\+srv)?:\/\//, '');
  const authority = withoutProtocol.split('/')[0] || '';
  const hostList = authority.includes('@') ? authority.split('@').pop() || '' : authority;
  return (hostList.split(',')[0] || '').split(':')[0].toLowerCase();
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return message.replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://<redacted>@');
}

const hostname = mongoHostname(uri);
const isLocal = ['mongo', 'localhost', '127.0.0.1'].includes(hostname);

if (process.env.ALLOW_READ_MODEL_BACKFILL !== 'true') {
  console.error('Refusing to backfill data. Set ALLOW_READ_MODEL_BACKFILL=true intentionally.');
  process.exit(1);
}

if (!isLocal && process.env.ALLOW_REMOTE_READ_MODEL_BACKFILL !== 'true') {
  console.error(
    `Refusing to backfill remote MongoDB host "${hostname}". ` +
      'Set ALLOW_REMOTE_READ_MODEL_BACKFILL=true only after confirming the exact target.'
  );
  process.exit(1);
}

const client = new MongoClient(uri);

async function bulkUpdate<T extends { _id?: unknown }>(
  collectionName: string,
  docs: T[],
  mapper: (doc: T) => Partial<T>
) {
  if (docs.length === 0) return 0;

  const db = client.db('ledger');
  const operations: AnyBulkWriteOperation<T>[] = docs
    .filter((doc) => doc._id)
    .map((doc) => ({
      updateOne: {
        filter: { _id: doc._id } as Filter<T>,
        update: { $set: mapper(doc) },
      },
    }));

  if (operations.length === 0) return 0;
  const result = await db.collection<T>(collectionName).bulkWrite(operations, { ordered: false });
  return result.modifiedCount + result.upsertedCount;
}

async function main() {
  await client.connect();
  const db = client.db('ledger');

  const [
    customers,
    suppliers,
    customEntities,
    inventoryItems,
    invoices,
  ] = await Promise.all([
    db.collection<Customer>('customers').find({}).toArray(),
    db.collection<Supplier>('suppliers').find({}).toArray(),
    db.collection<CustomEntity>('customEntities').find({}).toArray(),
    db.collection<InventoryItem>('inventory').find({}).toArray(),
    db.collection<Invoice>('invoices').find({}).toArray(),
  ]);

  const [customerUpdates, supplierUpdates, customEntityUpdates, inventoryUpdates, invoiceUpdates] =
    await Promise.all([
      bulkUpdate('customers', customers, (customer) => entitySearchFields(customer)),
      bulkUpdate('suppliers', suppliers, (supplier) => entitySearchFields(supplier)),
      bulkUpdate('customEntities', customEntities, (entity) => entitySearchFields(entity)),
      bulkUpdate('inventory', inventoryItems, (item) =>
        inventoryDerivedFields({
          ...item,
          createdAt: item.createdAt || new Date(0),
          updatedAt: item.updatedAt || item.createdAt || new Date(0),
        })
      ),
      bulkUpdate('invoices', invoices, (invoice) => invoiceSearchFields(invoice)),
    ]);

  const userIds = new Set<string>();
  for (const collection of [customers, suppliers, customEntities, inventoryItems, invoices]) {
    for (const doc of collection) {
      if (doc.userId) userIds.add(doc.userId);
    }
  }

  for (const userId of userIds) {
    await rebuildUserReadModels(db, userId);
  }

  console.log(`Updated customers: ${customerUpdates}`);
  console.log(`Updated suppliers: ${supplierUpdates}`);
  console.log(`Updated custom entities: ${customEntityUpdates}`);
  console.log(`Updated inventory items: ${inventoryUpdates}`);
  console.log(`Updated invoices: ${invoiceUpdates}`);
  console.log(`Rebuilt read models for users: ${userIds.size}`);
}

main()
  .catch((error) => {
    console.error(`Failed to backfill read models: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
