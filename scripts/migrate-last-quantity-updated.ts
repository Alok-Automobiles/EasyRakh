import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const uri = process.env.MONGODB_URI;
const UNKNOWN_QUANTITY_UPDATED_AT = new Date(0);

if (!uri) {
  console.error('MONGODB_URI is required. Add it to .env.local before running this migration.');
  process.exit(1);
}

const client = new MongoClient(uri);

async function main() {
  await client.connect();

  const db = client.db('ledger');
  const inventoryCollection = db.collection('inventory');

  const result = await inventoryCollection.updateMany(
    {
      $or: [
        { lastQuantityUpdatedAt: { $exists: false } },
        { lastQuantityUpdatedAt: null },
      ],
    },
    [
      {
        $set: {
          lastQuantityUpdatedAt: {
            $ifNull: ['$updatedAt', { $ifNull: ['$createdAt', UNKNOWN_QUANTITY_UPDATED_AT] }],
          },
        },
      },
    ]
  );

  console.log(`Matched ${result.matchedCount} inventory item(s).`);
  console.log(`Modified ${result.modifiedCount} inventory item(s).`);
}

main()
  .catch((error) => {
    console.error('Failed to migrate lastQuantityUpdatedAt:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
