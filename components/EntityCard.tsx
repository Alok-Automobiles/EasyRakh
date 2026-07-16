'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronRight, Mail, MapPin, Pencil, Phone, Trash2 } from 'lucide-react';

interface EntityCardProps {
  entity: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    totalBalance: number;
  };
  entityType: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function EntityCard({ entity, entityType, onEdit, onDelete }: EntityCardProps) {
  const router = useRouter();
  
  const isPositive = entity.totalBalance > 0;
  const isSettled = entity.totalBalance === 0;
  const displayBalance = Math.abs(entity.totalBalance);

  const handleCardClick = () => {
    router.push(`/ledger/${entityType}/${entity.id}`);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(entity.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(entity.id);
  };

  const initials = entity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCardClick();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${entity.name} ledger`}
      className="group relative cursor-pointer rounded-2xl border border-border bg-card px-4 py-4 shadow-sm outline-none transition-all hover:border-primary/20 hover:bg-muted/30 hover:shadow-md focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20 sm:rounded-none sm:border-0 sm:px-5 sm:shadow-none sm:hover:bg-muted/45 sm:hover:shadow-none"
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:flex sm:items-center sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary ring-1 ring-inset ring-primary/10">
          {initials || '—'}
        </div>

        <div className="min-w-0 sm:flex-1 sm:grid sm:grid-cols-[minmax(180px,1.1fr)_minmax(220px,1.4fr)] sm:items-center sm:gap-6">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
              {entity.name}
            </h3>
          </div>

          <div className="mt-1.5 flex min-w-0 flex-col gap-1 text-xs text-muted-foreground min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:gap-x-4 sm:mt-0 sm:text-sm">
            {entity.phone && (
              <span className="flex min-w-0 items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{entity.phone}</span>
              </span>
            )}
            {entity.email && (
              <span className="hidden min-w-0 items-center gap-1.5 lg:flex">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-52 truncate">{entity.email}</span>
              </span>
            )}
            {entity.address && (
              <span className={`min-w-0 items-center gap-1.5 ${entity.phone || entity.email ? 'hidden xl:flex' : 'flex'}`}>
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-64 truncate">{entity.address}</span>
              </span>
            )}
            {!entity.phone && !entity.email && !entity.address && (
              <span className="text-muted-foreground/70">No contact details</span>
            )}
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 items-end justify-between border-t border-border/70 pt-3 sm:ml-auto sm:block sm:shrink-0 sm:border-0 sm:pt-0 sm:text-right">
          <div className="sm:hidden">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Balance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {displayBalance === 0 ? 'Account settled' : isPositive ? 'You will receive' : 'You will pay'}
            </p>
          </div>
          <p className={`font-semibold tabular-nums ${isSettled ? 'text-foreground' : isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {isSettled ? '' : isPositive ? '+' : '-'}₹{displayBalance.toLocaleString('en-IN')}
          </p>
          <p className="mt-0.5 hidden text-[11px] uppercase tracking-wide text-muted-foreground sm:block">
            {displayBalance === 0 ? 'Settled' : isPositive ? 'Receivable' : 'Payable'}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-1 border-l border-border pl-3 sm:flex">
          <Button
            onClick={handleEditClick}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${entity.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={handleDeleteClick}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${entity.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/45 py-1.5 pl-3 pr-1.5 sm:hidden">
        <span className="flex items-center gap-1 text-sm font-medium text-primary">
          View ledger <ChevronRight className="h-4 w-4" />
        </span>
        <div className="flex items-center gap-1">
          <Button
            onClick={handleEditClick}
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label={`Edit ${entity.name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleDeleteClick}
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${entity.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
