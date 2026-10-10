# Faster PWA rollout

Deploy this change in stages so existing accounts have the incremental v2 read
model before their first save reaches the new code.

1. Run the existing backfill against the intended production cluster. It is
   deliberately guarded and will not load `.env.local`:

   ```sh
   ALLOW_READ_MODEL_BACKFILL=true ALLOW_REMOTE_READ_MODEL_BACKFILL=true \
   MONGODB_URI='...' pnpm backfill:read-models
   ```

2. Confirm every `userSummaries` document has `readModelVersion: 2`, and that
   `inventoryReadModelItems` has one row for each inventory item. Keep the
   backfill output as the repair record.
3. Deploy the application. New accounts are initialized with an empty v2
   summary in the registration transaction. Writes then synchronize only the
   changed customer, supplier, custom entity, inventory item, or invoice
   effects.
4. For seven days, review `/api/admin/performance?days=7` as an administrator.
   The default view is Indian mobile PWA data. It reports conservative p50/p95
   histogram bounds for warm navigation, ordinary saves, API work, cache state,
   MongoDB, and Redis. Upload, PDF, and cold-launch work remain separate.
5. Compare `userSummaries` and `entityBalances` with `pnpm
   backfill:read-models` in a staging copy before using the full rebuild as a
   repair tool in production.

## Region decision

Current production requests show a Mumbai edge (`bom1`) and Washington
function execution (`iad1`). Redis is already in `ap-south-1`; the Atlas
region needs confirmation in its console before moving anything. Do not set
`vercel.json` to `bom1` until Atlas is also in or near Mumbai and the Vercel
region price is approved. Moving only the function can make database latency
worse. Capture current Atlas/Vercel/Redis cost and rollback settings in the
change review before changing paid regions.
