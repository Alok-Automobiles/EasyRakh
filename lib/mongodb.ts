import { MongoClient, Db } from 'mongodb';
import { initializeIndexes } from './db-indexes';
import { monitorDatabaseTiming, timeStage } from './request-timing';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

const uri: string = process.env.MONGODB_URI;
const options = {
  monitorCommands: true,
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
};

type GlobalWithMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _indexesInitialized?: boolean;
};

const globalWithMongo = global as GlobalWithMongo;

if (!globalWithMongo._mongoClientPromise) {
  const client = new MongoClient(uri, options);
  monitorDatabaseTiming(client);
  globalWithMongo._mongoClientPromise = client.connect();
}

const clientPromise: Promise<MongoClient> = globalWithMongo._mongoClientPromise;

export async function getDb(): Promise<Db> {
  const client = await timeStage('db', () => clientPromise);
  const db = client.db('ledger');

  // Indexes are idempotent and Atlas already has them from prior deploys.
  // Run initialization in the background on the first call per process so it
  // doesn't add latency to the request that triggered the cold start.
  if (!globalWithMongo._indexesInitialized) {
    globalWithMongo._indexesInitialized = true;
    void initializeIndexes(db).catch((err) => {
      globalWithMongo._indexesInitialized = false;
      console.error('Background index initialization failed:', err);
    });
  }

  return db;
}

export default clientPromise;
