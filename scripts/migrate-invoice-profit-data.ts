import { config } from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import path from 'node:path';
import {
  calculateInvoiceLine,
  calculateInvoiceTotals,
  INVOICE_PRICING_VERSION,
  roundMoney,
} from '../lib/invoice-calculations';
import type { InvoiceItem } from '../lib/types';

config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('MONGODB_URI is required. Add it to .env.local before running this migration.');
}

// Use a dedicated client instead of getDb(). The app helper initializes indexes,
// while this script's default dry-run mode must remain strictly read-only.
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db('ledger');
  const invoices = db.collection('invoices');
  const inventory = db.collection('inventory');
  const cursor = invoices.find({ pricingVersion: { $ne: INVOICE_PRICING_VERSION } });
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: 0,
    migrated: 0,
    skippedInvalid: 0,
    missingCostItems: 0,
    originalSales: 0,
    migratedSales: 0,
  };

  for await (const invoice of cursor) {
    summary.scanned += 1;
    const linkedIds: string[] = Array.from(new Set<string>(
      (invoice.items || [])
        .map((item: any) => item.inventoryItemId)
        .filter((id: unknown): id is string => typeof id === 'string' && ObjectId.isValid(id))
    ));
    const inventoryItems = linkedIds.length > 0
      ? await inventory.find({
          userId: invoice.userId,
          _id: { $in: linkedIds.map((id) => new ObjectId(id)) },
        }, { projection: { buyingPrice: 1 } }).toArray()
      : [];
    const costs = new Map(inventoryItems.map((item) => [item._id.toString(), item.buyingPrice]));

    let invalid = false;
    const migratedItems: InvoiceItem[] = (invoice.items || []).map((item: any) => {
      const quantity = Number(item.quantity);
      const originalLineTotal = Number(item.amount || item.lineTotal || 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(originalLineTotal)) {
        invalid = true;
        return item as InvoiceItem;
      }
      const unitPrice = roundMoney(originalLineTotal / quantity);
      const availableCost = typeof item.unitCost === 'number'
        ? item.unitCost
        : costs.get(item.inventoryItemId);
      if (typeof availableCost !== 'number' || !Number.isFinite(availableCost) || availableCost < 0) {
        summary.missingCostItems += 1;
        return {
          ...item,
          id: item.id || new ObjectId().toString(),
          unitPrice,
          lineTotal: originalLineTotal,
          amount: originalLineTotal,
          costStatus: 'missing',
        };
      }
      const calculated = calculateInvoiceLine({ quantity, unitPrice, unitCost: availableCost });
      return {
        ...item,
        id: item.id || new ObjectId().toString(),
        unitPrice,
        lineTotal: originalLineTotal,
        amount: originalLineTotal,
        unitCost: availableCost,
        cogs: calculated.cogs,
        grossProfit: roundMoney(originalLineTotal - calculated.cogs),
        costStatus: 'complete',
        costSource: 'legacy_backfill',
      };
    });

    if (invalid) {
      summary.skippedInvalid += 1;
      continue;
    }

    const totals = calculateInvoiceTotals(migratedItems);
    const originalTotal = Number(invoice.totalAmount || 0);
    summary.originalSales = roundMoney(summary.originalSales + originalTotal);
    summary.migratedSales = roundMoney(summary.migratedSales + totals.totalAmount);
    if (roundMoney(originalTotal) !== roundMoney(totals.totalAmount)) {
      summary.skippedInvalid += 1;
      continue;
    }

    const now = new Date();
    const payments = Array.isArray(invoice.payments) && invoice.payments.length > 0
      ? invoice.payments
      : Number(invoice.paidAmount || 0) > 0
        ? [{
            id: new ObjectId().toString(),
            amount: Number(invoice.paidAmount),
            date: invoice.createdAt || now,
            source: 'legacy',
            createdAt: invoice.createdAt || now,
            updatedAt: now,
          }]
        : [];

    if (apply) {
      await invoices.updateOne(
        { _id: invoice._id, pricingVersion: { $ne: INVOICE_PRICING_VERSION } },
        {
          $set: {
            items: migratedItems,
            totalCogs: totals.totalCogs,
            costedSales: totals.costedSales,
            uncostedSales: totals.uncostedSales,
            missingCostItemCount: totals.missingCostItemCount,
            grossProfit: totals.grossProfit,
            grossMargin: totals.grossMargin,
            pricingVersion: INVOICE_PRICING_VERSION,
            payments,
            updatedAt: invoice.updatedAt || now,
          },
        }
      );
    }
    summary.migrated += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing this reconciliation report.');
  if (summary.originalSales !== summary.migratedSales) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
