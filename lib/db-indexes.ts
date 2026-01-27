import { Db } from 'mongodb';

/**
 * Initialize all database indexes for optimal query performance
 * Call this function once on application startup
 */
export async function initializeIndexes(db: Db): Promise<void> {
  try {
    // Customers collection indexes
    const customersCollection = db.collection('customers');
    await customersCollection.createIndex({ userId: 1, createdAt: -1 });

    // Suppliers collection indexes
    const suppliersCollection = db.collection('suppliers');
    await suppliersCollection.createIndex({ userId: 1, createdAt: -1 });

    // Transactions collection indexes
    const transactionsCollection = db.collection('transactions');
    await transactionsCollection.createIndex({ userId: 1, date: -1, createdAt: -1 });
    await transactionsCollection.createIndex({ userId: 1, entityId: 1, entityType: 1 });
    // Index for dashboard top customers/suppliers aggregation queries
    await transactionsCollection.createIndex({ userId: 1, entityType: 1 });
    // Index for sorting by createdAt (used in recent activities)
    await transactionsCollection.createIndex({ userId: 1, createdAt: -1 });

    // Daily cash records collection indexes
    const dailyCashRecordsCollection = db.collection('dailyCashRecords');
    await dailyCashRecordsCollection.createIndex({ userId: 1, date: -1 });

    // Notes collection indexes
    const notesCollection = db.collection('notes');
    await notesCollection.createIndex({ userId: 1, showOnDashboard: 1, updatedAt: -1 });
    await notesCollection.createIndex({ userId: 1, createdAt: -1 }); // For general queries

    // Users collection indexes
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ userId: 1 }); // If userId field exists separately

    // Collection types collection indexes
    const collectionTypesCollection = db.collection('collectionTypes');
    await collectionTypesCollection.createIndex({ userId: 1, slug: 1 }, { unique: true });
    await collectionTypesCollection.createIndex({ userId: 1, createdAt: -1 });

    // Custom entities collection indexes
    const customEntitiesCollection = db.collection('customEntities');
    await customEntitiesCollection.createIndex({ userId: 1, collectionType: 1, createdAt: -1 });
    await customEntitiesCollection.createIndex({ userId: 1, collectionType: 1 });

    // Invoices collection indexes
    const invoicesCollection = db.collection('invoices');
    await invoicesCollection.createIndex({ userId: 1, createdAt: -1 });
    await invoicesCollection.createIndex({ userId: 1, invoiceNumber: 1 }, { unique: true });
    await invoicesCollection.createIndex({ userId: 1, customerId: 1 });
    await invoicesCollection.createIndex({ userId: 1, status: 1 });
  } catch (error) {
    console.error('❌ Error initializing database indexes:', error);
    // Don't throw - allow app to continue even if index creation fails
    // Indexes may already exist, which is fine
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
    
    // Check if at least one index exists (besides _id)
    const hasIndexes = indexes.length > 1;
    return hasIndexes;
  } catch (error) {
    console.error('Error verifying indexes:', error);
    return false;
  }
}

