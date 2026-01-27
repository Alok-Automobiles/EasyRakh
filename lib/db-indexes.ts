import { Db } from 'mongodb';

/**
 * Initialize all database indexes for optimal query performance
 * Call this function once on application startup
 */
export async function initializeIndexes(db: Db): Promise<void> {
  try {
    const customersCollection = db.collection('customers');
    await customersCollection.createIndex({ userId: 1, createdAt: -1 });

    const suppliersCollection = db.collection('suppliers');
    await suppliersCollection.createIndex({ userId: 1, createdAt: -1 });

    const transactionsCollection = db.collection('transactions');
    await transactionsCollection.createIndex({ userId: 1, date: -1, createdAt: -1 });
    await transactionsCollection.createIndex({ userId: 1, entityId: 1, entityType: 1 });
    await transactionsCollection.createIndex({ userId: 1, entityType: 1 });
    await transactionsCollection.createIndex({ userId: 1, createdAt: -1 });

    const dailyCashRecordsCollection = db.collection('dailyCashRecords');
    await dailyCashRecordsCollection.createIndex({ userId: 1, date: -1 });

    const notesCollection = db.collection('notes');
    await notesCollection.createIndex({ userId: 1, showOnDashboard: 1, updatedAt: -1 });
    await notesCollection.createIndex({ userId: 1, createdAt: -1 });

    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ userId: 1 });

    const collectionTypesCollection = db.collection('collectionTypes');
    await collectionTypesCollection.createIndex({ userId: 1, slug: 1 }, { unique: true });
    await collectionTypesCollection.createIndex({ userId: 1, createdAt: -1 });

    const customEntitiesCollection = db.collection('customEntities');
    await customEntitiesCollection.createIndex({ userId: 1, collectionType: 1, createdAt: -1 });
    await customEntitiesCollection.createIndex({ userId: 1, collectionType: 1 });

    const invoicesCollection = db.collection('invoices');
    await invoicesCollection.createIndex({ userId: 1, createdAt: -1 });
    await invoicesCollection.createIndex({ userId: 1, invoiceNumber: 1 }, { unique: true });
    await invoicesCollection.createIndex({ userId: 1, customerId: 1 });
    await invoicesCollection.createIndex({ userId: 1, status: 1 });
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

