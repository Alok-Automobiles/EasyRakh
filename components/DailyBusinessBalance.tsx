'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatMoney, supplierRequest, useBusinessCash, useRefreshSupplierPayments } from '@/lib/hooks/useSupplierPayments';

/** A lightweight, optional balance check while the owner finishes Daily Cash. */
export default function DailyBusinessBalance() {
  const query = useBusinessCash();
  const refresh = useRefreshSupplierPayments();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<{ version: number; key: string } | null>(null);
  const inFlight = useRef(false);
  const cash = query.data?.businessCash;
  if (!query.data?.enabled || !cash) return null;

  async function confirm() {
    if (!cash || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    if (request.current?.version !== cash.version) request.current = { version: cash.version, key: crypto.randomUUID() };
    try {
      await supplierRequest('/api/business-cash/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentBalance: cash.currentBalance, expectedVersion: cash.version,
          reason: 'Owner confirmed balance from Daily Cash', idempotencyKey: request.current.key }) });
      await refresh();
      setMessage('Business balance confirmed. Payment reservations were cleared for review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to confirm your balance.');
      await refresh();
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <aside className="mb-4 rounded-lg border p-3 sm:p-4" aria-label="Business balance check">
    <p className="text-sm">EasyRakh shows {formatMoney(cash.currentBalance)} as your business balance. Is this correct?</p>
    <p className="mt-1 text-xs text-muted-foreground">Confirm after recording the day’s receipts and expenses. Confirming clears payment reservations for review.</p>
    {cash.needsReconciliation ? <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Confirm or correct this balance before planning more supplier payments.</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={confirm}>{busy ? 'Confirming…' : 'Confirm balance'}</Button>
      <Button size="sm" variant="ghost" asChild><Link href="/supplier-payments">Correct balance</Link></Button>
    </div>
    {message ? <p className="mt-2 text-sm" role="status">{message}</p> : null}
  </aside>;
}
