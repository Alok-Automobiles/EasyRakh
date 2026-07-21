import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import path from 'node:path';
import { initializeIndexes } from '../lib/db-indexes';
import { getInventoryStatusFilter } from '../lib/search-normalization';

config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is required. Add it to .env.local before running this script.');
  process.exit(1);
}

const client = new MongoClient(uri);
const LEDGER_PAGE_INDEX_HINT = {
  userId: 1,
  entityType: 1,
  entityId: 1,
  date: 1,
  createdAt: 1,
  _id: 1,
} as const;

function planHasStage(plan: unknown, stage: string): boolean {
  if (!plan || typeof plan !== 'object') return false;
  const record = plan as Record<string, unknown>;
  if (record.stage === stage) return true;
  return Object.values(record).some((value) => {
    if (Array.isArray(value)) return value.some((entry) => planHasStage(entry, stage));
    return planHasStage(value, stage);
  });
}

async function assertIndexedQuery(label: string, explainable: { explain(): Promise<unknown> }) {
  const explain = (await explainable.explain()) as Record<string, any>;
  const winningPlan = explain.queryPlanner?.winningPlan;
  const hasCollectionScan = planHasStage(winningPlan, 'COLLSCAN');
  const hasBlockingSort = planHasStage(winningPlan, 'SORT');

  if (hasCollectionScan || hasBlockingSort) {
    throw new Error(
      `${label} uses an inefficient winning plan: ${JSON.stringify(winningPlan)}`
    );
  }

  console.log(`OK ${label}`);
}

async function main() {
  await client.connect();
  const db = client.db('ledger');
  await initializeIndexes(db);
  const sampleUser = await db.collection('users').findOne({}, { projection: { _id: 1 } });
  const userId = sampleUser?._id?.toString() || 'query-shape-user';

  await assertIndexedQuery(
    'dashboard recent transactions',
    db.collection('transactions').find({ userId }).sort({ createdAt: -1 }).limit(20)
  );
  await assertIndexedQuery(
    'ledger page',
    db.collection('transactions')
      .find({ userId, entityType: 'customer', entityId: 'query-shape-entity' })
      .hint(LEDGER_PAGE_INDEX_HINT)
      .sort({ date: 1, createdAt: 1, _id: 1 })
      .limit(101)
  );
  await assertIndexedQuery(
    'inventory list',
    db.collection('inventory')
      .find({ userId, ...getInventoryStatusFilter('low-stock') })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(20)
  );
  await assertIndexedQuery(
    'invoice list',
    db.collection('invoices').find({ userId, status: 'paid' }).sort({ createdAt: -1 }).limit(20)
  );
  await assertIndexedQuery(
    'entity balances',
    db.collection('entityBalances').find({ userId, entityType: 'customer' }).sort({ lastTransactionDate: -1 }).limit(20)
  );
}

main()
  .catch((error) => {
    console.error('Hot query shape check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
