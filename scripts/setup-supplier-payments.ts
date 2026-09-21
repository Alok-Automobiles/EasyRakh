import { pathToFileURL } from 'node:url';
import { MongoClient, type Db, type Document } from 'mongodb';
import { ensureSupplierPaymentIndexes, SUPPLIER_PAYMENTS_INDEXES } from '../lib/supplier-payment-indexes';
import { supplierSnapshot } from '../lib/supplier-payments';

export interface SupplierSetupCheck {
  name: string;
  count: number;
  blocking: boolean;
}

async function countPipeline(db: Db, collection: string, pipeline: Document[]): Promise<number> {
  const result = await db.collection(collection).aggregate([...pipeline, { $count: 'count' }]).next();
  return result?.count ?? 0;
}

export async function inspectSupplierPaymentSetup(db: Db): Promise<SupplierSetupCheck[]> {
  const checks: SupplierSetupCheck[] = [];
  // Listing a missing collection is allowed; it must not be created by a check.
  const collectionNames = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name));
  for (const spec of SUPPLIER_PAYMENTS_INDEXES) {
    const existing = collectionNames.has(spec.collection)
      ? await db.collection(spec.collection).listIndexes().toArray() : [];
    const named = existing.find(index => index.name === spec.options.name);
    checks.push({ name: `missing_index:${spec.options.name}`, count: named ? 0 : 1, blocking: false });
    if (named) {
      const matches = JSON.stringify(named.key) === JSON.stringify(spec.key)
        && Boolean(named.unique) === Boolean(spec.options.unique)
        && JSON.stringify(named.partialFilterExpression ?? {}) === JSON.stringify(spec.options.partialFilterExpression ?? {});
      checks.push({ name: `conflicting_index:${spec.options.name}`, count: matches ? 0 : 1, blocking: true });
    }
  }
  for (const spec of SUPPLIER_PAYMENTS_INDEXES.filter((index) => index.options.unique)) {
    const key = spec.key as Record<string, unknown>;
    checks.push({
      name: `duplicates:${spec.options.name}`, blocking: true,
      count: await countPipeline(db, spec.collection, [
        { $match: spec.options.partialFilterExpression ?? {} },
        { $group: { _id: Object.fromEntries(Object.keys(key).map((field) => [field, `$${field}`])), count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]),
    });
  }
  checks.push({
    name: 'duplicate_daily_cash_records', blocking: true,
    count: await countPipeline(db, 'dailyCashRecords', [
      { $group: { _id: { userId: '$userId', date: '$date' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]),
  });
  checks.push({
    name: 'invalid_tracked_bill_totals', blocking: true,
    count: await countPipeline(db, 'transactions', [
      { $match: { entityType: 'supplier', type: 'credit', billStatus: { $exists: true } } },
      { $match: { $expr: { $or: [
        { $lt: ['$pendingAmount', 0] },
        { $lt: ['$paidAmount', 0] },
        { $lt: [{ $ifNull: ['$discountReceived', 0] }, 0] },
        { $gt: [{ $abs: { $subtract: [
          '$pendingAmount', { $subtract: [{ $subtract: ['$amount', '$paidAmount'] }, { $ifNull: ['$discountReceived', 0] }] },
        ] } }, 0.001] },
      ] } } },
    ]),
  });
  checks.push({
    name: 'invalid_structured_payment_totals', blocking: true,
    count: await countPipeline(db, 'transactions', [
      { $match: { entityType: 'supplier', type: 'debit', paymentAllocations: { $exists: true } } },
      { $match: { $expr: { $or: [
        { $lt: ['$cashPaidAmount', 0] },
        { $gt: [{ $abs: { $subtract: ['$amount', { $add: [{ $sum: '$paymentAllocations.settledAmount' }, { $ifNull: ['$previousBalanceSettledAmount', 0] }] }] } }, 0.001] },
        { $gt: [{ $abs: { $subtract: ['$cashPaidAmount', { $add: [{ $sum: '$paymentAllocations.cashAmount' }, { $ifNull: ['$previousBalanceCashAmount', 0] }] }] } }, 0.001] },
      ] } } },
    ]),
  });
  checks.push({
    name: 'broken_or_cross_supplier_allocations', blocking: true,
    count: await countPipeline(db, 'transactions', [
      { $match: { entityType: 'supplier', type: 'debit', paymentAllocations: { $exists: true } } },
      { $unwind: '$paymentAllocations' },
      { $lookup: {
        from: 'transactions',
        let: { billId: '$paymentAllocations.billTransactionId', user: '$userId', supplier: '$entityId' },
        pipeline: [{ $match: { $expr: { $and: [
          { $eq: [{ $toString: '$_id' }, '$$billId'] }, { $eq: ['$userId', '$$user'] },
          { $eq: ['$entityId', '$$supplier'] }, { $eq: ['$entityType', 'supplier'] },
          { $eq: ['$type', 'credit'] }, { $ne: [{ $type: '$billStatus' }, 'missing'] },
        ] } } }], as: 'bill',
      } },
      { $match: { bill: { $size: 0 } } },
    ]),
  });
  checks.push({
    name: 'expired_bill_reservations', blocking: false,
    count: await db.collection('transactions').countDocuments({
      entityType: 'supplier', reservationStatus: 'active',
      $or: [{ reservationExpiresAt: { $lte: new Date() } }, { reservationExpiresAt: { $lte: new Date().toISOString() } }],
    }),
  });
  // Use the same allocation arithmetic as the application without rebuilding or
  // writing bill caches. This detects legacy debits that overlap tracked dues.
  let supplierIssues = 0;
  for (const userId of await db.collection('suppliers').distinct('userId')) {
    supplierIssues += (await supplierSnapshot(db, String(userId))).issues.length;
  }
  checks.push({ name: 'supplier_ledger_allocation_issues', count: supplierIssues, blocking: true });
  return checks;
}

function targetHost(uri: string): string {
  const authority = uri.replace(/^mongodb(?:\+srv)?:\/\//, '').split('/')[0] ?? '';
  return authority.slice(authority.lastIndexOf('@') + 1);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    console.log('Explicit SUPPLIER_SETUP_MONGODB_URI and SUPPLIER_SETUP_DATABASE are required.');
    console.log('Default: read-only checks. --apply: create additive indexes after checks pass.');
    console.log('--allow-remote is also required with --apply for a non-loopback database.');
    console.log('This script never loads .env.local or changes business records.');
    return;
  }
  for (const arg of args) {
    if (!['--apply', '--allow-remote'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
  }
  const uri = process.env.SUPPLIER_SETUP_MONGODB_URI;
  const database = process.env.SUPPLIER_SETUP_DATABASE;
  if (!uri || !database) throw new Error('Provide SUPPLIER_SETUP_MONGODB_URI and SUPPLIER_SETUP_DATABASE explicitly; .env.local is never loaded.');
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error('Invalid MongoDB URI scheme');
  if (!/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Database name must contain only letters, numbers, underscores, or hyphens');
  const host = targetHost(uri);
  const local = host.split(',').every((entry) => /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(entry));
  if (args.has('--apply') && !local && !args.has('--allow-remote')) {
    throw new Error('Remote index creation requires --allow-remote in addition to --apply');
  }
  console.log(`${args.has('--apply') ? 'Apply indexes' : 'Read-only inspection'}: host=${host}, database=${database}`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, appName: 'easyrakh-supplier-setup' });
  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Supplier payment transactions require a replica set or sharded MongoDB deployment');
    const db = client.db(database);
    const checks = await inspectSupplierPaymentSetup(db);
    for (const check of checks) console.log(`${check.blocking && check.count > 0 ? 'BLOCK' : check.count > 0 ? 'NOTE' : 'PASS'} ${check.name}: ${check.count}`);
    if (checks.some((check) => check.blocking && check.count > 0)) {
      throw new Error('Resolve reported accounting or duplicate data issues before enabling; no indexes were changed');
    }
    for (const spec of SUPPLIER_PAYMENTS_INDEXES) console.log(`Index ${spec.collection}.${spec.options.name}`);
    if (args.has('--apply')) {
      await ensureSupplierPaymentIndexes(db);
      console.log('Additive indexes ready. No existing business records were rewritten.');
    } else {
      console.log('Read-only inspection complete; no records or indexes were changed.');
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Driver errors may contain URI credentials. Do not print the raw error.
    const message = error instanceof Error ? error.message : 'Unknown setup failure';
    console.error(message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, 'mongodb://<redacted>'));
    process.exitCode = 1;
  });
}
