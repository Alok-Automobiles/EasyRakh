# Supplier payments: operation, verification, and rollback

The feature extends supplier transactions and actual business cash tracking. It is disabled unless `SUPPLIER_PAYMENTS_ENABLED=true`. Set `SUPPLIER_PAYMENTS_EPOCH` explicitly for each activation period, for example `supplier-pilot-2026-09-13`. Changing this value makes previously initialized business balances require owner confirmation before new payment recommendations can be used.

## Data and accounting contract

Supplier credits remain purchases in `transactions`; optional invoice terms make a credit a tracked bill. Supplier debits remain liability settlements. A discounted debit's `amount` is the debt settled; `cashPaidAmount` is the amount actually paid. For a ₹50,000 invoice with an eligible 2.5% full-settlement discount, these are ₹50,000 and ₹48,750 respectively. Allocations on that debit identify the original bills. Earlier payments must be allocated before the system can reliably compute per-bill pending amounts.

The only added collection is `businessBalanceAdjustments`, containing opening setup and manual balance confirmations. Current business cash lives on `users.businessCash`. Reservations live on tracked bill credits, or `suppliers.previousBalanceReservation` for an untracked previous balance. No purchase, supplier payment, or ordinary Daily Cash movement is copied into the adjustment collection.

The existing Daily Cash meaning remains: Money In is actual receipts; Money Out is business expenses plus owner withdrawals. Supplier payments have a separate daily total. COGS and gross profit do not themselves change cash. Supplier purchases on credit do not change cash. Invoice receipts change cash through their linked Daily Cash entry exactly once.

The invariants are:

- Bill pending = original invoice amount − allocated cash − accepted discount.
- Supplier due follows the original supplier ledger; Previous Balance is its unallocated payable remainder after tracked bill pending amounts.
- Business cash changes by actual Daily Cash In − Daily Cash Out − actual supplier cash paid.
- Available for supplier payments = business cash − protected amount − active reservations.
- Reserving or cancelling a payment changes neither cash nor supplier debt.
- A payment, its allocations, bill totals, and business cash update in one MongoDB transaction.
- A cash confirmation establishes a new anchor. Editing an entry from an older anchor requires another confirmation; it must not automatically change the newly confirmed actual balance.

Amounts are calculated to paise. Cash discounts are accepted only for complete settlement by the invoice's discount deadline. The supplier and bill partial-payment settings both apply. A discount that would require zero or negative remaining cash after prior payments is not automatically claimed.

## Rules and workflow

The owner sets their current business money and protected amount, then records purchases using the existing supplier ledger Add Transaction flow. Bill fields include invoice number, invoice date, due date, discount percent and deadline, and partial-payment terms. The existing attachment uploader remains available. Supplier credit limits and criticality are entered on the supplier.

The Supplier Payments page displays balances, bills, previous balances, payment history, reservations, and reasons for recommendations. A reservation only earmarks available money in EasyRakh. The owner records an actual payment after paying outside the application.

The rule order is a business-stopping supplier at its credit limit, overdue bills, bills due today, important suppliers, full-settlement discounts expiring within three days, then other bills and previous balances. An important supplier at or above 90% of its credit limit receives a more specific explanation but remains in the same priority group. Ties use due dates and stable IDs. The rules use recorded funds and current terms; no forecast collections enter available cash. Recommended payment dates and reservations must be reviewed when facts change. Reservations expire at the end of their scheduled India calendar date; expired reservations no longer reduce availability even before their stored status is cleaned up.

## APIs

| API | Purpose |
| --- | --- |
| Existing `/api/transactions` and `/api/transactions/:id` | Add, read, edit, or delete supplier bills and payments with the existing ledger workflow |
| `GET /api/business-cash` | Read enabled state and current business balance |
| `POST /api/business-cash` | Initialize the actual business balance once |
| `PATCH /api/business-cash` | Change the protected amount |
| `POST /api/business-cash/reconcile` | Confirm actual funds, record adjustment, advance the anchor and clear reservations |
| `GET /api/supplier-payments` | Read recommendations, reservations, supplier bills, previous balances, issues and actual daily supplier total |
| `POST /api/supplier-payments/reserve` | Reserve cash for a bill or previous balance |
| `POST /api/supplier-payments/pay` | Record actual payment and allocations |
| `POST /api/supplier-payments/cancel` | Cancel a reservation |

Write requests include a request ID or idempotency key and, where cash decisions are involved, the displayed cash version. A stale version returns HTTP 409. Retry the same logical command with the same ID after an uncertain network response; use a new ID for a different operation. The server validates ownership and uses primary database values rather than cached dashboard totals when committing.

## Database readiness

MongoDB must support transactions: use a replica set or sharded deployment. The canonical additive index definitions are in `lib/supplier-payment-indexes.ts`. They include tracked invoice uniqueness scoped to owner and supplier, supplier transaction request uniqueness, adjustment request uniqueness, due dates, allocation references, reservation expiry, and adjustment history. Historical transactions without tracked bill fields are excluded from tracked invoice uniqueness.

The setup script does not load `.env.local`. Provide its dedicated URI and database variables intentionally. The URI should be injected by the shell or secret manager; avoid placing credentials in committed files or command history.

```sh
pnpm exec tsx scripts/setup-supplier-payments.ts --help
# With SUPPLIER_SETUP_MONGODB_URI and SUPPLIER_SETUP_DATABASE set explicitly:
pnpm exec tsx scripts/setup-supplier-payments.ts
```

The default run is read-only. It reports duplicate keys, duplicate Daily Cash records, broken allocations and inconsistent stored totals. Investigate any blocking result against the ledger before activation. It neither fixes nor deletes financial records.

To create the additive indexes after confirming the target and reviewing checks:

```sh
pnpm exec tsx scripts/setup-supplier-payments.ts --apply
# A non-loopback target additionally requires --allow-remote.
```

The script never drops or replaces indexes, rewrites old transactions, initializes owner balances, or replays historical cash. Index creation can partially succeed before a later index fails; rerun after investigating. MongoDB refuses a unique index when matching duplicates already exist. See [MongoDB partial-index documentation](https://www.mongodb.com/docs/manual/core/index-partial/) and [unique-index documentation](https://www.mongodb.com/docs/v7.0/core/index-unique/).

## Verification before activation

```sh
pnpm test:unit
pnpm test:supplier-integration
pnpm exec tsc --noEmit
pnpm build
```

`test:supplier-integration` starts a disposable, loopback-only MongoDB replica set using a real `mongod`; its first run downloads the pinned test binary. It overrides inherited Mongo configuration before importing application modules and never connects to the application database from `.env.local`. It uses real routes, calculations, MongoDB sessions and writes, while replacing authentication identity extraction and external cache/attachment effects. Its teardown stops only its own temporary replica set. Install-time binary downloads are disabled in `pnpm-workspace.yaml`.

The integration suite covers actual bill and payment APIs, stored recommendation reasons, discounts versus debt, Daily Cash separation, duplicate and simultaneous requests, protected funds, multi-bill allocations, payment edits/deletes, invoice receipt helpers, historical cash anchors, future-date rejection, disabled compatibility, and reactivation after legacy payments. Mocked unit tests alone do not establish multi-document atomicity or concurrency safety.

Also exercise the visible workflow against disposable data: opening balance, supplier terms, bill upload/preview, reservation, recording actual payment, correcting a payment, reviewing the separate daily total, and disabling/re-enabling. Verify small-screen forms and the existing customer/invoice paths. Local automated tests are evidence about the tested implementation; they do not establish production deployment configuration, backup availability, or whether suppliers accept the entered discount terms.

Activate first for a controlled test business using manually approved payments. Compare computed bill pending and cash with the owner's records. Investigate every unexplained difference before expanding use. An actual payment outside EasyRakh is never executed by the recommendation system.

## Rollback mechanism

The supported immediate rollback is a deployment of this compatibility-aware code with `SUPPLIER_PAYMENTS_ENABLED=false`. Record that exact deployment or commit as the rollback target before enabling. The guards must remain in that target: structured payments and bills are protected from generic edits/deletes while disabled, and supplier deletion must not cascade through structured payments.

Changing a deployment environment variable is not an instant global switch. Redeploy or restart all serving instances so they receive the disabled value, and wait for old instances and in-flight writes to stop before declaring the feature disabled. Verify new supplier-payment requests are rejected on the serving version. Mixed old and new deployments are not a completed rollback.

The rollback sequence is:

1. Record the incident window and last deployed version. Stop new feature activity by deploying the compatibility-aware version with the flag disabled.
2. Confirm the serving application hides the feature, rejects its mutation endpoints, and still accepts ordinary legacy Daily Cash and supplier ledger transactions. Confirm structured-record edit/delete guards remain effective.
3. Retain all bills, completed supplier debit transactions, allocations, cash confirmations, indexes, and attachments. Existing bills and payments still contribute their original credit/debit amounts to the ledger. Reservations are only internal earmarks; they do not require reversing a financial transaction.
4. Investigate the affected records and deploy the fix with the feature still disabled. Correct proven errors through reviewed accounting operations; do not bulk delete fields or restore a database snapshot over legitimate later business activity.
5. Before reactivation, use a **new** `SUPPLIER_PAYMENTS_EPOCH`, deploy the enabled version, and require each owner to confirm the actual business balance. Rebuild bill totals from debit allocations and clear prior reservations in that confirmation transaction.
6. If legacy payments recorded during the disabled period also settle tracked bills, allocate those existing payments to the correct bills first. Preserve their amount, supplier and actual payment date. Do not add a duplicate debit. Multiple such payments may require incremental repairs before cash confirmation succeeds. Recommendations remain unavailable while allocation issues or cash confirmation requirements remain.

An arbitrary GitHub Revert to code written before these guards is **not** the supported rollback. Additional optional database fields alone do not make that safe: old code can delete or move financial records it does not understand, leaving pending amounts and cash inconsistent. A code revert also cannot undo real payments or repair stored accounting errors. If the feature is permanently removed, retain the compatibility guards and the valid ledger records; any later data cleanup is a separate reviewed migration.

A successful rollback rehearsal demonstrates that the disabled code accepts legacy business activity, preserves and protects structured records, and then re-enables only after correct allocation and cash confirmation. It does not require deleting the new collection or reversing legitimate business payments.
