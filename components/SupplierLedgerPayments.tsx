'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useBusinessCash, useSupplierPayments, formatMoney, displayPaymentDate } from '@/lib/hooks/useSupplierPayments';

export default function SupplierLedgerPayments({ supplierId }: { supplierId: string }) {
  const feature = useBusinessCash();
  const query = useSupplierPayments(feature.data?.enabled === true, supplierId);
  if (!feature.data?.enabled) return null;
  const supplier = query.data?.suppliers.find((item) => item.id === supplierId);
  return <section className="mb-6 space-y-4 rounded-xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Bills and supplier payments</h2><p className="text-sm text-muted-foreground">Individual bill balances and payment terms.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/transactions/new?entityType=supplier&entityId=${supplierId}&type=credit`}>Add bill</Link></Button><Button asChild><Link href={`/transactions/new?entityType=supplier&entityId=${supplierId}&type=debit`}>Record payment</Link></Button><Button variant="outline" asChild><Link href="/supplier-payments">Payment recommendations</Link></Button></div></div>
    {query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading bill details…</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
    {supplier && <>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><p>Previous Balance: <span className="font-semibold">{formatMoney(supplier.previousBalance)}</span></p><p>Credit limit: <span className="font-semibold">{supplier.creditLimit == null ? 'Not set' : formatMoney(supplier.creditLimit)}</span></p><p>Supply impact: <span className="font-semibold">{supplier.criticality.replaceAll('_', '-')}</span></p></div>
      {supplier.bills.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr><th className="p-2 font-medium">Bill</th><th className="p-2 font-medium">Due</th><th className="p-2 font-medium">Cash discount</th><th className="p-2 text-right font-medium">Pending</th><th className="p-2 text-right font-medium">Reserved</th></tr></thead><tbody>{supplier.bills.map((bill) => <tr className="border-b border-border last:border-0" key={bill.id}><td className="p-2"><p className="font-medium">{bill.invoiceNumber}</p><p className="text-xs text-muted-foreground">{bill.billStatus} · {formatMoney(bill.amount)}</p></td><td className="p-2 whitespace-nowrap">{displayPaymentDate(bill.dueDate)}</td><td className="p-2">{bill.cashDiscountPercentage ? `${bill.cashDiscountPercentage}% until ${displayPaymentDate(bill.cashDiscountLastDate)}` : '—'}</td><td className="p-2 text-right tabular-nums">{formatMoney(bill.pendingAmount)}</td><td className="p-2 text-right tabular-nums">{formatMoney(bill.reservedAmount)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No individually tracked bills yet. Existing dues remain in Previous Balance.</p>}
    </>}
  </section>;
}
