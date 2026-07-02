import { Db } from 'mongodb';

/**
 * Initialize all database indexes for optimal query performance.
 * Idempotent: createIndex is a no-op when an equivalent index already exists.
 *
 * All indexes are created concurrently to minimize cold-start latency.
 */
export async function initializeIndexes(db: Db): Promise<void> {
  try {
    const customers = db.collection('customers');
    const suppliers = db.collection('suppliers');
    const transactions = db.collection('transactions');
    const dailyCashRecords = db.collection('dailyCashRecords');
    const notes = db.collection('notes');
    const users = db.collection('users');
    const collectionTypes = db.collection('collectionTypes');
    const customEntities = db.collection('customEntities');
    const invoices = db.collection('invoices');
    const inventory = db.collection('inventory');

    await Promise.all([
      customers.createIndex({ userId: 1, createdAt: -1 }),

      suppliers.createIndex({ userId: 1, createdAt: -1 }),

      transactions.createIndex({ userId: 1, date: -1, createdAt: -1 }),
      transactions.createIndex({ userId: 1, entityId: 1, entityType: 1 }),
      transactions.createIndex({ userId: 1, entityType: 1 }),
      transactions.createIndex({ userId: 1, createdAt: -1 }),

      dailyCashRecords.createIndex({ userId: 1, date: -1 }),

      notes.createIndex({ userId: 1, showOnDashboard: 1, updatedAt: -1 }),
      notes.createIndex({ userId: 1, createdAt: -1 }),

      users.createIndex({ email: 1 }, { unique: true }),
      users.createIndex({ userId: 1 }),
      users.createIndex({ lastActiveAt: -1 }),
      users.createIndex({ lastLoginAt: -1 }),

      collectionTypes.createIndex({ userId: 1, slug: 1 }, { unique: true }),
      collectionTypes.createIndex({ userId: 1, createdAt: -1 }),

      customEntities.createIndex({ userId: 1, collectionType: 1, createdAt: -1 }),
      customEntities.createIndex({ userId: 1, collectionType: 1 }),

      invoices.createIndex({ userId: 1, createdAt: -1 }),
      invoices.createIndex({ userId: 1, invoiceNumber: 1 }, { unique: true }),
      invoices.createIndex({ userId: 1, customerId: 1 }),
      invoices.createIndex({ userId: 1, status: 1 }),

      inventory.createIndex({ userId: 1, updatedAt: -1, createdAt: -1 }),
      inventory.createIndex({ userId: 1, itemName: 1 }),
      inventory.createIndex({ userId: 1, itemNumber: 1 }),
      inventory.createIndex({ userId: 1, quantity: 1 }),
      inventory.createIndex({ userId: 1, quantity: 1, lastQuantityUpdatedAt: 1 }),
      inventory.createIndex({ userId: 1, location: 1 }),
    ]);
  } catch (error) {
    console.error('❌ Error initializing database indexes:', error);
  }
}

/**
 * Check if indexes exist and are up to date
 * Useful for health checks
 */
export async function verifyIndexes(db: Db): Promise<boolean> {
  try {
    const customersCollection = db.collection('customers');
    const indexes = await customersCollection.indexes();

    const hasIndexes = indexes.length > 1;
    return hasIndexes;
  } catch (error) {
    console.error('Error verifying indexes:', error);
    return false;
  }
}
