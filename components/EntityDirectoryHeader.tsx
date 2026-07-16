'use client';

import { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EntityDirectoryHeaderProps {
  title: string;
  description: string;
  singularLabel: string;
  count: number;
  receivable: number;
  payable: number;
  icon: ReactNode;
  searchQuery: string;
  searchPlaceholder: string;
  resultCount?: number;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  backLink?: ReactNode;
}

function formatCurrency(value: number) {
  return `₹${Math.abs(value).toLocaleString('en-IN')}`;
}

export default function EntityDirectoryHeader({
  title,
  description,
  singularLabel,
  count,
  receivable,
  payable,
  icon,
  searchQuery,
  searchPlaceholder,
  resultCount,
  onSearchChange,
  onAdd,
  backLink,
}: EntityDirectoryHeaderProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0">
          {backLink}
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary sm:h-11 sm:w-11">
              {icon}
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-foreground sm:truncate sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>

        <Button onClick={onAdd} className="h-11 w-full shrink-0 gap-2 px-4 shadow-none sm:h-10 sm:w-auto">
          <Plus className="h-4 w-4" />
          Add {singularLabel}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:bg-card dark:sm:bg-card">
        <div className="col-span-2 flex min-w-0 items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm sm:col-span-1 sm:block sm:rounded-none sm:border-0 sm:px-5 sm:py-4 sm:shadow-none">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total records</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground sm:mt-1">{count.toLocaleString('en-IN')}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-4 shadow-sm sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:shadow-none">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs sm:tracking-wider">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10">
              <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            </span>
            Receivable
          </div>
          <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 sm:mt-1">
            {formatCurrency(receivable)}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-rose-500/15 bg-rose-500/[0.04] px-4 py-4 shadow-sm sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:shadow-none">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs sm:tracking-wider">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10">
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-rose-600" />
            </span>
            Payable
          </div>
          <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400 sm:mt-1">
            {formatCurrency(payable)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-12 rounded-xl bg-card pl-10 pr-10 text-base shadow-sm placeholder:text-sm sm:h-11 sm:text-sm sm:shadow-none sm:placeholder:text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="px-1 text-xs text-muted-foreground sm:px-0 sm:text-sm">
          {resultCount === undefined ? `${count} ${count === 1 ? singularLabel.toLowerCase() : title.toLowerCase()}` : `${resultCount} of ${count} shown`}
        </p>
      </div>
    </div>
  );
}
