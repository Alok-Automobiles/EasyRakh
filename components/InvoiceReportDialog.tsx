'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InvoiceCustomerFilter } from '@/components/InvoiceCustomerFilter';
import { invoiceSortOptions } from '@/lib/invoice-list-state';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { defaultInvoiceListState, invoiceFilterErrors, type InvoiceListState } from '@/lib/invoice-list-state';

const selectClass = 'h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:light] dark:[color-scheme:dark]';

type Props = {
  filters: InvoiceListState;
  downloading: boolean;
  onDownload: (filters: InvoiceListState) => Promise<boolean>;
};

export function InvoiceReportDialog({ filters, downloading, onDownload }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(filters);
  const [month, setMonth] = useState('');
  const errors = invoiceFilterErrors(report);
  const change = (patch: Partial<InvoiceListState>) => {
    if ('startDate' in patch || 'endDate' in patch) setMonth('');
    setReport((current) => ({ ...current, ...patch, page: 1 }));
  };

  function chooseMonth(value: string) {
    setMonth(value);
    if (!value) {
      setReport((current) => ({ ...current, startDate: '', endDate: '', page: 1 }));
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const lastDay = new Date(`${value}-01T00:00:00Z`);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    setReport((current) => ({ ...current, startDate: `${value}-01`, endDate: lastDay.toISOString().slice(0, 10), page: 1 }));
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setReport({ ...filters, page: 1 }); setMonth(''); setOpen(true); }}>
        <Download className="size-4" />Download list PDF
      </Button>
      <Dialog open={open} onOpenChange={(value) => { if (!downloading) setOpen(value); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle>Download invoice list</DialogTitle>
            <DialogDescription>Filter your report by date, customer and payment status. All matching pages are included.</DialogDescription>
          </DialogHeader>
          <fieldset disabled={downloading} className="min-w-0 space-y-5">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
              <div>
                <label htmlFor="report-month" className="mb-1.5 block text-sm font-medium">Invoice month</label>
                <Input id="report-month" type="month" value={month} onChange={(event) => chooseMonth(event.target.value)} />
                <p className="mt-1.5 text-xs text-muted-foreground">Choose a month or enter dates below.</p>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Customer / ledger account</p>
                <InvoiceCustomerFilter value={report.customerId} onChange={(customerId) => change({ customerId })} />
              </div>
              <div>
                <label htmlFor="report-start" className="mb-1.5 block text-sm font-medium">From invoice date</label>
                <Input id="report-start" type="date" value={report.startDate} aria-invalid={Boolean(errors.date)} onChange={(event) => change({ startDate: event.target.value })} />
              </div>
              <div>
                <label htmlFor="report-end" className="mb-1.5 block text-sm font-medium">To invoice date</label>
                <Input id="report-end" type="date" value={report.endDate} aria-invalid={Boolean(errors.date)} onChange={(event) => change({ endDate: event.target.value })} />
              </div>
              {errors.date && <p role="alert" className="text-sm text-destructive sm:col-span-2">{errors.date}</p>}
              <div>
                <label htmlFor="report-status" className="mb-1.5 block text-sm font-medium">Payment status</label>
                <select id="report-status" className={selectClass} value={report.status} onChange={(event) => change({ status: event.target.value as InvoiceListState['status'] })}>
                  <option value="all">All statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="outstanding">Unpaid + partially paid</option><option value="paid">Paid</option>
                </select>
              </div>
              <div>
                <label htmlFor="report-ledger" className="mb-1.5 block text-sm font-medium">Ledger status</label>
                <select id="report-ledger" className={selectClass} value={report.addedToLedger} onChange={(event) => change({ addedToLedger: event.target.value as InvoiceListState['addedToLedger'] })}>
                  <option value="all">All invoices</option><option value="true">In ledger</option><option value="false">Not in ledger</option>
                </select>
              </div>
            </div>
            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Search, amounts and sorting</summary>
              <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
                <div className="sm:col-span-2">
                  <label htmlFor="report-search" className="mb-1.5 block text-sm font-medium">Search invoices</label>
                  <Input id="report-search" placeholder="Customer, phone or invoice number" value={report.search} onChange={(event) => change({ search: event.target.value })} />
                </div>
                <div>
                  <label htmlFor="report-min" className="mb-1.5 block text-sm font-medium">Minimum total (₹)</label>
                  <Input id="report-min" type="number" min="0" step="0.01" value={report.minAmount} onChange={(event) => change({ minAmount: event.target.value })} />
                </div>
                <div>
                  <label htmlFor="report-max" className="mb-1.5 block text-sm font-medium">Maximum total (₹)</label>
                  <Input id="report-max" type="number" min="0" step="0.01" value={report.maxAmount} onChange={(event) => change({ maxAmount: event.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="report-sort" className="mb-1.5 block text-sm font-medium">Sort invoices</label>
                  <select id="report-sort" className={selectClass} value={report.sort} onChange={(event) => change({ sort: event.target.value as InvoiceListState['sort'] })}>
                    {invoiceSortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
            </details>
            {errors.amount && <p role="alert" className="text-sm text-destructive">{errors.amount}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Amounts include total, paid and outstanding balance.</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setReport(defaultInvoiceListState); setMonth(''); }}>Clear filters</Button>
            </div>
          </fieldset>
          <DialogFooter>
            <Button variant="outline" disabled={downloading} onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={downloading || Boolean(errors.date || errors.amount)} onClick={async () => { if (await onDownload(report)) setOpen(false); }}>
              <Download className="size-4" />{downloading ? 'Preparing PDF...' : 'Download PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
