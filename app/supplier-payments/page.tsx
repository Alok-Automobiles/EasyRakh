'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Wallet, RefreshCw, Plus, ShieldCheck, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AllocationDraft, SupplierPaymentFields, allocationCashTotal, allocationPayload, emptyAllocation } from '@/components/SupplierPaymentFields';
import { PaymentRecommendation, SupplierPaymentView, businessToday, displayPaymentDate, formatMoney, paymentRequestFingerprint, supplierRequest, useBusinessCash, useRefreshSupplierPayments, useSupplierPayments } from '@/lib/hooks/useSupplierPayments';

type CashAction = 'opening' | 'protected' | 'reconcile';
type PaymentTarget = { supplier: SupplierPaymentView; billId?: string; reservationId?: string };

export default function SupplierPaymentsPage() {
  const cashQuery = useBusinessCash();
  const [date, setDate] = useState(businessToday);
  const paymentsQuery = useSupplierPayments(cashQuery.data?.enabled === true, undefined, date);
  const refresh = useRefreshSupplierPayments();
  const [busy, setBusy] = useState(false);
  const [cashAction, setCashAction] = useState<CashAction | null>(null);
  const [balanceInput, setBalanceInput] = useState('');
  const [protectedInput, setProtectedInput] = useState('');
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState<PaymentTarget | null>(null);
  const [paymentDate, setPaymentDate] = useState(businessToday);
  const [allocation, setAllocation] = useState<AllocationDraft>(emptyAllocation);
  const [description, setDescription] = useState('');
  // An unchanged retry keeps its key if the response was lost after the server committed.
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const data = paymentsQuery.data;
  const cash = data?.businessCash ?? cashQuery.data?.businessCash;
  const requiresConfirmation = !!cash?.needsReconciliation;

  async function mutate(url: string, payload: Record<string, unknown>, method = 'POST') {
    if (inFlight.current) return false;
    inFlight.current = true;
    const fingerprint = paymentRequestFingerprint({ url, ...payload, method });
    if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    try {
      await supplierRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId: pendingRequest.current.key, idempotencyKey: pendingRequest.current.key }) });
      pendingRequest.current = null;
      try { await refresh(); }
      catch { toast.error('Saved successfully, but the screen could not refresh. Use Refresh to reload the latest balances.'); }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save. Please try again.');
      try { await refresh(); } catch { /* Keep the original mutation error visible. */ }
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  }

  function openCash(action: CashAction) {
    setCashAction(action);
    setBalanceInput(cash ? String(cash.currentBalance) : '');
    setProtectedInput(cash ? String(cash.protectedAmount) : '');
    setReason('');
  }

  async function saveCash(event: FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = { expectedVersion: cash?.version };
    if (cashAction !== 'protected') payload.currentBalance = Number(balanceInput);
    if (cashAction !== 'reconcile') payload.protectedAmount = Number(protectedInput);
    if (cashAction === 'reconcile') payload.reason = reason || 'Owner confirmed business balance';
    const success = await mutate(cashAction === 'reconcile' ? '/api/business-cash/reconcile' : '/api/business-cash', payload, cashAction === 'protected' ? 'PATCH' : 'POST');
    if (success) { setCashAction(null); toast.success('Business balance updated'); }
  }

  function openPayment(supplier: SupplierPaymentView, billId?: string, amount?: number, reservationId?: string) {
    const draft = emptyAllocation();
    if (amount) {
      if (billId) {
        const bill = supplier.bills.find((item) => item.id === billId);
        const discount = bill ? Math.round(bill.amount * (bill.cashDiscountPercentage ?? 0)) / 100 : 0;
        const discountedSettlement = bill && bill.cashDiscountLastDate && businessToday() <= bill.cashDiscountLastDate && !bill.discountReceived && Math.round((bill.pendingAmount - amount) * 100) === Math.round(discount * 100);
        draft.bills[billId] = { cash: String(amount), discount: discountedSettlement ? String(discount) : '' };
      }
      else draft.previous = String(amount);
    }
    setAllocation(draft);
    setPaymentDate(businessToday());
    setDescription('');
    setPayment({ supplier, billId, reservationId });
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!payment || !data) return;
    if (allocationCashTotal(allocation) <= 0) { toast.error('Enter the money actually paid'); return; }
    const success = await mutate('/api/supplier-payments/pay', { supplierId: payment.supplier.id, ...allocationPayload(allocation), date: paymentDate, description, reservationId: payment.reservationId, expectedVersion: data.version });
    if (success) { setPayment(null); toast.success('Supplier payment recorded'); }
  }

  async function reserve(recommendation: PaymentRecommendation) {
    if (!data) return;
    if (await mutate('/api/supplier-payments/reserve', { supplierId: recommendation.supplierId, billTransactionId: recommendation.billTransactionId, amount: recommendation.recommendedAmount, paymentDate: recommendation.paymentDate, recommendationReason: recommendation.explanation, expectedVersion: data.version })) toast.success('Money reserved. Record the payment once it is actually made.');
  }

  async function cancel(supplierId: string, reservationId: string, billId?: string) {
    if (await mutate('/api/supplier-payments/cancel', { supplierId, billTransactionId: billId, reservationId, expectedVersion: data?.version })) toast.success('Reservation released');
  }

  if (cashQuery.isPending) return <div className="p-8 text-muted-foreground" role="status">Loading supplier payments…</div>;
  if (cashQuery.isError) return <div className="p-8 space-y-4"><p role="alert">{cashQuery.error.message}</p><Button onClick={() => void cashQuery.refetch()}>Try again</Button></div>;
  if (!cashQuery.data?.enabled) return <div className="mx-auto max-w-3xl p-8 space-y-3"><h1 className="text-2xl font-semibold">Supplier Payments</h1><p className="text-muted-foreground">Supplier payment recommendations are currently unavailable.</p><Link href="/suppliers" className="text-blue-600 underline">Go to supplier ledgers</Link></div>;

  const reservations = (data?.suppliers ?? []).flatMap((supplier) => [
    ...supplier.bills.filter((bill) => bill.reservationStatus === 'active' && bill.reservationId && (!bill.reservationExpiresAt || new Date(bill.reservationExpiresAt) > new Date())).map((bill) => ({ supplier, billId: bill.id, id: bill.reservationId!, amount: bill.reservedAmount, title: bill.invoiceNumber, paymentDate: bill.recommendedPaymentDate, expiresAt: bill.reservationExpiresAt, reason: bill.recommendationReason })),
    ...(supplier.previousBalanceReservation?.status === 'active' && new Date(supplier.previousBalanceReservation.expiresAt) > new Date() ? [{ supplier, billId: undefined, id: supplier.previousBalanceReservation.id, amount: supplier.previousBalanceReservation.amount, title: 'Previous Balance', paymentDate: supplier.previousBalanceReservation.recommendedPaymentDate, expiresAt: supplier.previousBalanceReservation.expiresAt, reason: supplier.previousBalanceReservation.reason }] : []),
  ]);
  const canPlan = !!cash && !requiresConfirmation && !busy && !paymentsQuery.isFetching && !data?.issues?.length;

  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 p-3 text-blue-600"><Wallet className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold">Supplier Payments</h1><p className="text-sm text-muted-foreground">Decide who to pay using money available in your business today.</p></div></div><Button variant="outline" onClick={() => void refresh()} disabled={busy || paymentsQuery.isFetching}><RefreshCw className="h-4 w-4" />Refresh</Button></div>

    {!cash && <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3"><h2 className="font-semibold">Start with your business money</h2><p className="text-sm text-muted-foreground">Enter the money currently available for this business, including business cash and the business portion of your bank balance. Future receipts are excluded.</p><Button onClick={() => openCash('opening')}>Set business balance</Button></section>}
    {requiresConfirmation && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3"><h2 className="font-semibold">Confirm your business balance</h2><p className="text-sm">Your balance needs confirmation before new reservations or payments can be planned.</p><Button onClick={() => openCash('reconcile')}>Confirm balance</Button></section>}
    {paymentsQuery.isError && <section role="alert" className="rounded-xl border border-destructive p-4"><p>{paymentsQuery.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void paymentsQuery.refetch()}>Try again</Button></section>}

    {cash && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        { label: 'Business balance', value: cash.currentBalance },
        { label: 'Protected amount', value: cash.protectedAmount },
        { label: 'Reserved', value: data?.summary.reservedAmount ?? 0 },
        { label: 'Available to reserve', value: data?.summary.availableAmount ?? 0 },
      ].map((item) => <div key={item.label} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums">{formatMoney(item.value)}</p></div>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">EasyRakh shows {formatMoney(cash.currentBalance)} as your business balance. Is this correct?</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openCash('reconcile')}>Confirm / correct</Button><Button variant="outline" size="sm" onClick={() => openCash('protected')}><ShieldCheck className="h-4 w-4" />Change protected amount</Button></div></div>
    </>}

    <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Supplier money paid</h2><p className="text-sm text-muted-foreground">Separate from Daily Cash Money Out.</p></div><div className="flex items-center gap-3"><Label htmlFor="supplier-payment-total-date" className="sr-only">Payment total date</Label><Input id="supplier-payment-total-date" className="w-auto" type="date" value={date} max={businessToday()} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /><p className="text-xl font-semibold tabular-nums">{formatMoney(data?.summary.dailySupplierPayments ?? 0)}</p></div></div></section>

    {(data?.issues?.length ?? 0) > 0 && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold">Supplier balances need review</h2><ul className="mt-2 list-disc pl-5 text-sm space-y-1">{data?.issues.map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : issue.message}</li>)}</ul></section>}

    {!!data?.issues?.length && <p className="text-sm text-muted-foreground">Open the supplier ledger below and edit earlier payments to connect them to bills. Then confirm your business balance.</p>}
    <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Suggested payments</h2><span className="text-xs text-muted-foreground">Based on actual balances and bill terms</span></div>
      {paymentsQuery.isPending && <p className="text-sm text-muted-foreground" role="status">Loading bills and recommendations…</p>}
      {!paymentsQuery.isPending && !data?.recommendations.length && <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{!cash ? 'Set your business balance to get recommendations.' : requiresConfirmation ? 'Confirm your business balance to refresh recommendations.' : 'No payments can be recommended from the available money and recorded bill terms.'}</div>}
      {data?.recommendations.map((recommendation) => {
        const supplier = data.suppliers.find((item) => item.id === recommendation.supplierId);
        if (!supplier) return null;
        const bill = supplier.bills.find((item) => item.id === recommendation.billTransactionId);
        return <article key={`${supplier.id}-${recommendation.billTransactionId ?? 'previous'}`} className="rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-1"><Link href={`/ledger/supplier/${supplier.id}`} className="font-semibold hover:underline">{supplier.name}</Link><p className="text-sm text-muted-foreground">{bill?.invoiceNumber ?? 'Previous Balance'}</p><p className="max-w-2xl text-sm">{recommendation.explanation}</p><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{displayPaymentDate(recommendation.paymentDate)}</p></div><div className="space-y-3 sm:text-right"><p className="text-xl font-semibold tabular-nums">{formatMoney(recommendation.recommendedAmount)}</p><Button disabled={!canPlan} onClick={() => void reserve(recommendation)}>Reserve money</Button></div></div></article>;
      })}
      <p className="text-xs text-muted-foreground">Reserving sets money aside in EasyRakh. Record a payment only after you have paid the supplier.</p>
    </section>

    {reservations.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Reserved payments</h2>{reservations.map((item) => <article key={item.id} className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 flex flex-wrap items-center justify-between gap-4"><div><p className="font-medium">{item.supplier.name} · {item.title}</p><p className="text-sm text-muted-foreground">{formatMoney(item.amount)} · Pay {displayPaymentDate(item.paymentDate)} · Reservation expires {displayPaymentDate(item.expiresAt)}</p>{item.reason && <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>}</div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void cancel(item.supplier.id, item.id, item.billId)}>Release</Button><Button disabled={!canPlan} onClick={() => openPayment(item.supplier, item.billId, item.amount, item.id)}>Mark as paid</Button></div></article>)}</section>}

    {!!data?.payments?.length && <section className="space-y-3"><h2 className="text-lg font-semibold">Recent supplier payments</h2><div className="divide-y divide-border rounded-xl border border-border bg-card">{data.payments.slice(0, 10).map((item) => {
      const supplier = data.suppliers.find((entry) => entry.id === item.entityId);
      const cashPaid = item.cashPaidAmount ?? item.amount;
      return <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{supplier ? <Link className="hover:underline" href={`/ledger/supplier/${supplier.id}`}>{supplier.name}</Link> : 'Supplier payment'}</p><p className="text-xs text-muted-foreground">{displayPaymentDate(item.date)}{item.description ? ` · ${item.description}` : ''}</p></div><div className="text-right"><p className="font-semibold tabular-nums">Cash paid {formatMoney(cashPaid)}</p>{item.amount !== cashPaid && <p className="text-xs text-emerald-700">Dues reduced {formatMoney(item.amount)}</p>}</div></article>;
    })}</div></section>}

    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Supplier dues</h2><Button variant="outline" asChild><Link href="/transactions/new?entityType=supplier"><Plus className="h-4 w-4" />Add transaction</Link></Button></div><div className="divide-y divide-border rounded-xl border border-border bg-card">{data?.suppliers.map((supplier) => <div className="flex flex-wrap items-center justify-between gap-3 p-4" key={supplier.id}><div><Link className="font-medium hover:underline" href={`/ledger/supplier/${supplier.id}`}>{supplier.name}</Link><p className="text-xs text-muted-foreground">Previous Balance {formatMoney(supplier.previousBalance)}{supplier.creditLimit != null ? ` · Credit limit ${formatMoney(supplier.creditLimit)}` : ''}</p></div><div className="flex items-center gap-4"><p className="font-semibold tabular-nums">{formatMoney(supplier.totalDue)}</p><Button variant="outline" size="sm" disabled={!canPlan || supplier.totalDue <= 0} onClick={() => openPayment(supplier)}>Record payment</Button></div></div>)}{data?.suppliers.length === 0 && <p className="p-5 text-sm text-muted-foreground">Add a supplier and their bills from the supplier ledger.</p>}</div></section>

    <Dialog open={cashAction !== null} onOpenChange={(open) => { if (!open && !busy) setCashAction(null); }}><DialogContent><DialogHeader><DialogTitle>{cashAction === 'opening' ? 'Set business balance' : cashAction === 'protected' ? 'Change protected amount' : 'Confirm business balance'}</DialogTitle><DialogDescription>{cashAction === 'protected' ? 'Keep this amount available for business needs. You can change it whenever needed.' : 'Use the money currently available for this business. A correction refreshes your recommendations and releases reservations for review.'}</DialogDescription></DialogHeader><form onSubmit={saveCash} className="space-y-4">{cashAction !== 'protected' && <div className="space-y-2"><Label htmlFor="business-balance">Actual business balance (₹)</Label><Input id="business-balance" required type="number" inputMode="decimal" step="0.01" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} /></div>}{cashAction !== 'reconcile' && <div className="space-y-2"><Label htmlFor="protected-amount">Protected amount (₹)</Label><Input id="protected-amount" required type="number" inputMode="decimal" min="0" step="0.01" value={protectedInput} onChange={(e) => setProtectedInput(e.target.value)} /></div>}{cashAction === 'reconcile' && <div className="space-y-2"><Label htmlFor="balance-reason">Reason (optional)</Label><Input id="balance-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example, corrected missing cash" /></div>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save balance'}</Button></form></DialogContent></Dialog>

    <Dialog open={payment !== null} onOpenChange={(open) => { if (!open && !busy) setPayment(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Record payment to {payment?.supplier.name}</DialogTitle><DialogDescription>Record the actual money already paid. This reduces the business balance and the supplier dues.</DialogDescription></DialogHeader>{payment && <form onSubmit={savePayment} className="space-y-4"><div className="space-y-2"><Label htmlFor="actual-payment-date">Payment date</Label><Input id="actual-payment-date" type="date" required max={businessToday()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div><SupplierPaymentFields supplier={payment.supplier} value={allocation} onChange={setAllocation} date={paymentDate} /><div className="space-y-2"><Label htmlFor="payment-description">Note (optional)</Label><Input id="payment-description" value={description} onChange={(e) => setDescription(e.target.value)} /></div><Button type="submit" disabled={busy || allocationCashTotal(allocation) <= 0}>{busy ? 'Recording…' : `Record ${formatMoney(allocationCashTotal(allocation))} paid`}</Button></form>}</DialogContent></Dialog>
  </div>;
}
