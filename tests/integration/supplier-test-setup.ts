import { inject } from 'vitest';

// Replace inherited values before any application module can connect.
process.env.MONGODB_URI = inject('supplierTestMongoUri');
process.env.JWT_SECRET = 'supplier-integration-local-only';
process.env.SUPPLIER_PAYMENTS_ENABLED = 'true';
process.env.SUPPLIER_PAYMENTS_EPOCH = 'integration-first-enable';
process.env.TZ = 'UTC';
