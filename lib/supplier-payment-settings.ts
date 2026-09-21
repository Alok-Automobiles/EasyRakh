/** Server-only configuration. Keep the compatibility guards when rolling back. */
export function supplierPaymentsEnabled() {
  return process.env.SUPPLIER_PAYMENTS_ENABLED === 'true';
}

/** Change this value after any period running without cash tracking. */
export function featureEpoch() {
  return process.env.SUPPLIER_PAYMENTS_EPOCH?.trim() || 'v1';
}
