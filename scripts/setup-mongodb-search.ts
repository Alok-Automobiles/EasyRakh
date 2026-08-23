import { MongoClient, type SearchIndexDescription } from 'mongodb';
import { MONGODB_SEARCH_INDEXES } from '../lib/mongodb-search-indexes';

const uri = process.env.MONGODB_URI;
const allowSetup = process.env.ALLOW_SEARCH_INDEX_SETUP === 'true';
const allowRemote = process.env.ALLOW_REMOTE_SEARCH_INDEX_SETUP === 'true';
const dryRun = process.argv.includes('--dry-run');
const indexName = process.env.MONGODB_SEARCH_INDEX?.trim() || 'easyrakh_search';
const collectionsArgument = process.argv.find((argument) => argument.startsWith('--collections='));
const requestedCollections = collectionsArgument
  ? new Set(
      collectionsArgument
        .slice('--collections='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  : null;
const indexConfigs = requestedCollections
  ? MONGODB_SEARCH_INDEXES.filter((config) => requestedCollections.has(config.collection))
  : MONGODB_SEARCH_INDEXES;

if (!uri) {
  console.error('MONGODB_URI must be provided explicitly. This script never loads .env.local.');
  process.exit(1);
}

if (requestedCollections && indexConfigs.length !== requestedCollections.size) {
  const known = new Set<string>(MONGODB_SEARCH_INDEXES.map((config) => config.collection));
  const unknown = Array.from(requestedCollections).filter((value) => !known.has(value));
  console.error(`Unknown collections: ${unknown.join(', ')}`);
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

if (!dryRun && !allowSetup) {
  console.error('Refusing to change search indexes. Set ALLOW_SEARCH_INDEX_SETUP=true intentionally.');
  process.exit(1);
}

if (!dryRun && !isLocal && !allowRemote) {
  console.error(
    `Refusing to change search indexes on remote MongoDB host "${hostname}". ` +
      'Set ALLOW_REMOTE_SEARCH_INDEX_SETUP=true only after confirming the exact target.'
  );
  process.exit(1);
}

if (dryRun) {
  console.log(`MongoDB Search index plan for host "${hostname}":`);
  for (const index of indexConfigs) {
    console.log(`- ${index.collection}.${indexName}`);
  }
  process.exit(0);
}

const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db('ledger');

  for (const config of indexConfigs) {
    const collection = db.collection(config.collection);
    const existing = await collection.listSearchIndexes(indexName).toArray();
    const definition = config.definition as SearchIndexDescription['definition'];

    if (existing.length > 0) {
      await collection.updateSearchIndex(indexName, definition);
      console.log(`Updated ${config.collection}.${indexName}`);
    } else {
      await collection.createSearchIndex({ name: indexName, definition });
      console.log(`Created ${config.collection}.${indexName}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(`MongoDB Search index setup failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
