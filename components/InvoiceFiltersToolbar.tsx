'use client';

import { useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InvoiceCustomerFilter } from '@/components/InvoiceCustomerFilter';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  invoiceDateOptions, invoiceDatePresetRange, invoiceFilterErrors,
  invoiceSortOptions, type InvoiceDatePreset, type InvoiceListState,
} from '@/lib/invoice-list-state';

type Props = {
  draft: InvoiceListState;
  filters: InvoiceListState;
  onChange: (patch: Partial<InvoiceListState>, debounce?: boolean) => void;
  onClear: () => void;
};

const statusLabels = { all: 'All statuses', paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' };
const ledgerLabels = { all: 'All invoices', true: 'In ledger', false: 'Not in ledger' };

function selectedPreset(filters: InvoiceListState): InvoiceDatePreset {
  if (!filters.startDate && !filters.endDate) return 'all';
  for (const [preset] of invoiceDateOptions) {
    if (preset === 'all' || preset === 'custom') continue;
    const range = invoiceDatePresetRange(preset);
    if (range.startDate === filters.startDate && range.endDate === filters.endDate) return preset;
  }
  return 'custom';
}

export function InvoiceFiltersToolbar({ draft, filters, onChange, onClear }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const errors = invoiceFilterErrors(draft);
  const advancedVisible = moreOpen || Boolean(errors.amount);
  const preset = customOpen ? 'custom' : selectedPreset(draft);
  const advancedCount = Number(Boolean(filters.customerId))
    + Number(Boolean(filters.minAmount || filters.maxAmount))
    + Number(filters.addedToLedger !== 'all');
  const activeCount = Number(Boolean(filters.search)) + Number(filters.status !== 'all')
    + Number(Boolean(filters.startDate || filters.endDate)) + advancedCount
    + Number(filters.sort !== 'default');
  const hasDraft = Object.entries(draft).some(([key, value]) =>
    key !== 'page' && value !== filters[key as keyof InvoiceListState]
  );

  function changePreset(value: InvoiceDatePreset) {
    if (value === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(invoiceDatePresetRange(value));
  }

  function clearAll() {
    setCustomOpen(false);
    setMoreOpen(false);
    onClear();
  }

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (filters.search) chips.push({ label: `Search: ${filters.search}`, clear: () => onChange({ search: '' }) });
  if (filters.status !== 'all') chips.push({ label: statusLabels[filters.status], clear: () => onChange({ status: 'all' }) });
  if (filters.startDate || filters.endDate) chips.push({
    label: `Date: ${filters.startDate || 'Any'} – ${filters.endDate || 'Any'}`,
    clear: () => { setCustomOpen(false); onChange({ startDate: '', endDate: '' }); },
  });
  if (filters.customerId) chips.push({ label: 'Customer selected', clear: () => onChange({ customerId: '' }) });
  if (filters.minAmount || filters.maxAmount) chips.push({
    label: `Amount: ₹${filters.minAmount || '0'} – ${filters.maxAmount ? `₹${filters.maxAmount}` : 'Any'}`,
    clear: () => onChange({ minAmount: '', maxAmount: '' }),
  });
  if (filters.addedToLedger !== 'all') chips.push({
    label: ledgerLabels[filters.addedToLedger], clear: () => onChange({ addedToLedger: 'all' }),
  });
  if (filters.sort !== 'default') chips.push({
    label: invoiceSortOptions.find(([value]) => value === filters.sort)?.[1] || 'Sort',
    clear: () => onChange({ sort: 'default' }),
  });

  return (
    <section aria-label="Invoice search and filters" className="mb-6 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,2fr)_minmax(120px,1fr)_minmax(160px,1.2fr)_minmax(170px,1.3fr)_minmax(140px,auto)]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            aria-label="Search invoices"
            placeholder="Customer, phone or invoice number..."
            value={draft.search}
            onChange={(event) => onChange({ search: event.target.value }, true)}
            className="pl-10"
          />
        </div>
        <Select value={draft.status} onValueChange={(value) => onChange({ status: value as InvoiceListState['status'] })}>
          <SelectTrigger aria-label="Payment status" className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={preset} onValueChange={(value) => changePreset(value as InvoiceDatePreset)}>
          <SelectTrigger aria-label="Invoice date" className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {invoiceDateOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={draft.sort} onValueChange={(value) => onChange({ sort: value as InvoiceListState['sort'] })}>
          <SelectTrigger aria-label="Sort invoices" className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {invoiceSortOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" aria-expanded={advancedVisible} onClick={() => setMoreOpen((open) => !open)} className="h-10 justify-center">
          <Filter aria-hidden="true" className="size-4" /> More filters{advancedCount ? ` (${advancedCount})` : ''}
        </Button>
      </div>

      {(preset === 'custom' || errors.date) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
          <div>
            <label htmlFor="invoice-start-date" className="mb-1 block text-sm text-gray-600">From invoice date</label>
            <Input id="invoice-start-date" type="date" value={draft.startDate} aria-invalid={Boolean(errors.date)} onChange={(event) => onChange({ startDate: event.target.value })} />
          </div>
          <div>
            <label htmlFor="invoice-end-date" className="mb-1 block text-sm text-gray-600">To invoice date</label>
            <Input id="invoice-end-date" type="date" value={draft.endDate} aria-invalid={Boolean(errors.date)} onChange={(event) => onChange({ endDate: event.target.value })} />
          </div>
          {errors.date && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{errors.date}</p>}
        </div>
      )}

      {advancedVisible && (
        <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="mb-1 block text-sm text-gray-600">Customer</label>
            <InvoiceCustomerFilter value={draft.customerId} onChange={(customerId) => onChange({ customerId })} />
          </div>
          <div>
            <label htmlFor="invoice-min-amount" className="mb-1 block text-sm text-gray-600">Minimum total (₹)</label>
            <Input id="invoice-min-amount" type="number" min="0" step="0.01" inputMode="decimal" value={draft.minAmount} aria-invalid={Boolean(errors.amount)} onChange={(event) => onChange({ minAmount: event.target.value }, true)} />
          </div>
          <div>
            <label htmlFor="invoice-max-amount" className="mb-1 block text-sm text-gray-600">Maximum total (₹)</label>
            <Input id="invoice-max-amount" type="number" min="0" step="0.01" inputMode="decimal" value={draft.maxAmount} aria-invalid={Boolean(errors.amount)} onChange={(event) => onChange({ maxAmount: event.target.value }, true)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Ledger status</label>
            <Select value={draft.addedToLedger} onValueChange={(value) => onChange({ addedToLedger: value as InvoiceListState['addedToLedger'] })}>
              <SelectTrigger aria-label="Ledger status" className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ledgerLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {errors.amount && <p role="alert" className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{errors.amount}</p>}
        </div>
      )}

      {(activeCount > 0 || hasDraft) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {chips.map((chip) => (
            <Button key={chip.label} type="button" variant="outline" size="sm" onClick={chip.clear} aria-label={`Remove ${chip.label} filter`} className="h-auto max-w-full rounded-full py-1 text-xs font-normal">
              <span className="truncate">{chip.label}</span><X aria-hidden="true" className="size-3" />
            </Button>
          ))}
          <Button type="button" variant="ghost" size="sm" className="ml-auto text-xs" onClick={clearAll}>Clear all</Button>
        </div>
      )}
    </section>
  );
}
