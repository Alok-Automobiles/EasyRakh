import { MongoClient, Db } from 'mongodb';
import { initializeIndexes } from './db-indexes';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

const uri: string = process.env.MONGODB_URI;
const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;
let indexesInitialized = false;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
    _indexesInitialized?: boolean;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
  indexesInitialized = globalWithMongo._indexesInitialized || false;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  const db = client.db('ledger');
  
  // Initialize indexes once on first connection
  if (!indexesInitialized) {
    await initializeIndexes(db);
    indexesInitialized = true;
    
    // Store in global for development mode
    if (process.env.NODE_ENV === 'development') {
      let globalWithMongo = global as typeof globalThis & {
        _indexesInitialized?: boolean;
      };
      globalWithMongo._indexesInitialized = true;
    }
  }
  
  return db;
}

export default clientPromise;

