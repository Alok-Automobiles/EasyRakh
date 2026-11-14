# Performance measurement and rollout

## Changes

- Customer, supplier, custom entity, transaction and invoice writes refresh only affected entity balances. MongoDB aggregates their authoritative transactions and applies the difference to user totals. Moving a transaction refreshes both entities. Repeated refreshes do not apply money twice.
- Refreshes use a snapshot transaction and a per-user write to serialize concurrent refreshes. A failed refresh rolls back all of its balance and summary changes. Full rebuilds remain available for initialization, backfill and repair. MongoDB must support transactions (Atlas or a replica set).
- Inventory writes aggregate only inventory in MongoDB. They no longer load customers, suppliers or ledger history. Inventory totals still scan the user's inventory; per-item incremental stock summaries are a possible follow-up if measured inventory refresh time warrants it.
- Cache generations are invalidated after summary maintenance completes. Optional cache reads/writes have a 150 ms budget and a five-second process-local outage cooldown; the inventory read helper retains its 250 ms budget. Redis commands have a 500 ms deadline and one retry at most. Correctness-related invalidations are still attempted during the optional-cache cooldown.
- The existing 15-second post-write cache bypass is retained, including during Redis failures. It is not a cross-instance guarantee against stale cache generations after a failed invalidation; reducing it requires durable invalidation/recovery work and production evidence.
- Sidebar, header and invoice setup share a five-minute React Query bootstrap entry. Relevant mutations invalidate it. Logout and successful authentication clear account query state; bootstrap fetches support cancellation.
- The service worker serves content-hashed `/_next/static/` assets from cache first. API data stays network-only; changing public assets remain network-first. The new worker removes obsolete asset caches.

## Measurements

Core data APIs return `Server-Timing` with `total`, MongoDB command time (`db`), optional cache time (`redis`), and summary maintenance time (`summary`). Stages are inclusive: parallel database operations and summary work overlap, so they must not be added together. Total covers the handler through Response creation, not request ingress, cold module loading or body transfer. Cold starts, connection checkout and network latency also need platform traces.

Set `PERFORMANCE_LOGGING=1` on the server to emit structured request timing logs. Route labels are source templates; logs contain no query parameters, database command contents, account IDs or request bodies. Timing headers are available without enabling logs.

Set `NEXT_PUBLIC_PERFORMANCE_METRICS=1` **at build time**, and `PERFORMANCE_LOGGING=1` at runtime, to collect browser metrics from a random 10% of document loads. `/api/performance` accepts only same-origin, bounded payloads containing a metric name, numeric value, coarse page group and mobile/desktop viewport category. No account ID, full URL, DOM attribution or persistent browser ID is included. Browser collection is disabled by default.

Group request logs by route and status, and browser logs by page group, metric and device category. Calculate p50/p75/p95 over a representative traffic window. Target field mobile INP p75 <= 200 ms. Set API latency targets after collecting the deployed baseline; local results do not establish a production SLA.

## Reproduce validation

```sh
pnpm test:unit
pnpm test:performance:db
pnpm build
pnpm test:performance:browser
pnpm check:query-shapes
```

The database suite starts an isolated loopback replica set and compares targeted results with full rebuilds for concurrent refreshes, legacy ledger rows, entity moves, deletion, stock summaries, missing summaries and transaction rollback/retry. It records median full-rebuild and targeted-refresh timings for 20 and 5,000 transactions in `test-results/performance/database.json`.

The browser suite starts a production Next.js server with an isolated test database, mocks API responses, and profiles dashboard, customer directory, inventory list and invoice entry with a Pixel 5 viewport and 4x CPU throttling. It records cold/warm document readiness, long tasks and Event Timing samples in `test-results/performance/browser.json`. It also verifies bootstrap reuse during client navigation. These are client diagnostics with synthetic data, not live API timings or real-device field INP. Playwright routing disables HTTP caching, so the warm visit primarily measures a warmed server/process; service-worker caching is tested separately.

## Production verification

Deploy through the normal release process, enable measurements for a bounded observation window, and compare cold/warm loads, search and saves for both small and large accounts. Verify app, MongoDB and Redis regions and database query execution plans. Check mobile interaction samples on real lower-powered devices; retain the throttled browser profile as a reproducible diagnostic.

No database tier or pool-size change is required. Two legacy ledger lookup indexes (`userId/customerId` and `userId/supplierId`) are added through the existing index initializer. No data migration is needed for existing summaries. If a source write commits but subsequent summary maintenance fails, the source write remains authoritative; run the existing `backfill:read-models` repair command after resolving the failure. This pre-existing post-write failure boundary has not been converted into a durable job queue.

Rollback application changes through the normal release process; the additional indexes and `users.readModelRevision` field are backward-compatible. Do not roll back to an older service worker cache strategy solely to diagnose backend latency.
