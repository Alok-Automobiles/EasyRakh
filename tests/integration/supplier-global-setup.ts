import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    supplierTestMongoUri: string;
  }
}

export default async function setup(project: TestProject) {
  // Never accept MONGODB_URI or a developer's database as a test target.
  // A real mongod is downloaded on first run; install scripts stay disabled.
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.5' },
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
  const uri = replSet.getUri('ledger');
  if (!uri.startsWith('mongodb://127.0.0.1:')) {
    await replSet.stop();
    throw new Error('Integration harness refused a non-loopback MongoDB URI');
  }
  project.provide('supplierTestMongoUri', uri);
  return async () => { await replSet.stop(); };
}
