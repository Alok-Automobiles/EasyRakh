import { mkdir, writeFile } from 'node:fs/promises';
import { buildInvoicePdfBuffer } from '../lib/invoice-pdf';

async function main() {
  const outputDir = 'tmp/pdfs';
  await mkdir(outputDir, { recursive: true });
  const baseInvoice = {
    invoiceNumber: 'INV-2026-07-0001',
    customerName: 'Raj Traders',
    customerPhone: '9000000000',
    customerAddress: 'Jaipur, Rajasthan',
    items: [
      { itemName: 'Brake Pad', itemNumber: 'BP-104', quantity: 2, amount: 400, unitPrice: 200, lineTotal: 400 },
      { itemName: 'Oil Filter', itemNumber: 'OF-20', quantity: 1, amount: 500, unitPrice: 500, lineTotal: 500 },
    ],
    totalAmount: 900,
    paidAmount: 400,
    status: 'partial' as const,
    notes: 'Balance payable within seven days.',
    createdAt: '2026-07-22T10:00:00.000Z',
    sellerSnapshot: {
      firmTitle: 'EasyRakh Auto Parts',
      gstNumber: '22AAAAA0000A1Z5',
      firmPhone: '9876543210',
      firmEmail: 'billing@example.com',
      firmAddress: 'Delhi, India',
    },
  };

  await writeFile(`${outputDir}/invoice-sample.pdf`, buildInvoicePdfBuffer(baseInvoice));
  const manyItems = Array.from({ length: 48 }, (_, index) => ({
    itemName: `Sample inventory item ${index + 1}`,
    itemNumber: `PART-${String(index + 1).padStart(3, '0')}`,
    quantity: 1,
    amount: 100 + index,
    unitPrice: 100 + index,
    lineTotal: 100 + index,
  }));
  const manyItemsTotal = manyItems.reduce((sum, item) => sum + item.lineTotal, 0);
  await writeFile(`${outputDir}/invoice-many-items.pdf`, buildInvoicePdfBuffer({
    ...baseInvoice,
    invoiceNumber: 'INV-2026-07-0048',
    customerAddress: 'A deliberately long customer address used to confirm that wrapping does not overlap the item table, Jaipur, Rajasthan, India',
    items: manyItems,
    totalAmount: manyItemsTotal,
    paidAmount: 0,
    status: 'unpaid',
    notes: 'Long invoice layout test. '.repeat(80),
  }));

  console.log(`${outputDir}/invoice-sample.pdf`);
  console.log(`${outputDir}/invoice-many-items.pdf`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
