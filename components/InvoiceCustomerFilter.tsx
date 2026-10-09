'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Users } from 'lucide-react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface CustomerOption {
  id: string;
  name: string;
  phone?: string;
}

interface CustomerPage {
  customers: CustomerOption[];
  pagination: { page: number; totalPages: number };
}

interface InvoiceCustomerFilterProps {
  value: string;
  onChange: (id: string) => void;
}

const selectedCustomerKey = (id: string) => ['invoice-filter-customer', id];

function CustomerOptions({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (customer: CustomerOption | null) => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const needsMoreCharacters = search.trim().length === 1;
  const searchPending = search.trim() !== debouncedSearch;
  const {
    data,
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['invoice-filter-customers', debouncedSearch],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<CustomerPage> => {
      const params = new URLSearchParams({ search: debouncedSearch, page: String(pageParam), limit: '20' });
      const response = await fetch(`/api/customers?${params}`, { signal });
      if (!response.ok) throw new Error('Unable to load customers. Please try again.');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.totalPages
      ? lastPage.pagination.page + 1
      : undefined,
    enabled: debouncedSearch.length !== 1,
    staleTime: 30_000,
    retry: false,
  });

  const customers = data?.pages.flatMap((page) => page.customers) ?? [];
  const showResults = !needsMoreCharacters && !searchPending;

  return (
    <Command label="Search customers by name or phone" shouldFilter={false} loop>
      <CommandInput
        aria-label="Search customers by name or phone"
        placeholder="Search by name or phone..."
        value={search}
        onValueChange={setSearch}
        maxLength={100}
      />
      <CommandList label="Customers" className="mt-2 max-h-[min(300px,45vh)]">
        <CommandItem value="all-customers" onSelect={() => onSelect(null)}>
          <Check aria-hidden="true" className={value ? 'opacity-0' : ''} />
          All customers
        </CommandItem>
        {showResults && customers.map((customer) => (
          <CommandItem key={customer.id} value={customer.id} onSelect={() => onSelect(customer)}>
            <Check aria-hidden="true" className={value === customer.id ? '' : 'opacity-0'} />
            <span className="flex min-w-0 flex-col py-1">
              <span className="truncate">{customer.name}</span>
              {customer.phone && <span className="text-xs text-muted-foreground">{customer.phone}</span>}
            </span>
          </CommandItem>
        ))}
        {needsMoreCharacters && (
          <p role="status" className="px-3 py-5 text-sm text-muted-foreground">Type at least 2 characters to search.</p>
        )}
        {!needsMoreCharacters && (searchPending || isFetching) && (
          <p role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading customers...
          </p>
        )}
        {showResults && !isFetching && !error && customers.length === 0 && (
          <p role="status" className="px-3 py-5 text-sm text-muted-foreground">
            {debouncedSearch ? 'No matching customers.' : 'No customers yet.'}
          </p>
        )}
      </CommandList>
      {showResults && error && (
        <div className="flex items-center justify-between gap-3 border-t px-3 py-3">
          <p role="alert" className="text-sm text-destructive">Unable to load customers.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>Retry</Button>
        </div>
      )}
      {showResults && hasNextPage && !error && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading more...' : 'Load more customers'}
        </Button>
      )}
    </Command>
  );
}

export function InvoiceCustomerFilter({ value, onChange }: InvoiceCustomerFilterProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: selected, isError } = useQuery({
    queryKey: selectedCustomerKey(value),
    queryFn: async ({ signal }): Promise<CustomerOption> => {
      const response = await fetch(`/api/customers/${encodeURIComponent(value)}`, { signal });
      if (!response.ok) throw new Error('Selected customer unavailable');
      const data: { customer: CustomerOption } = await response.json();
      return data.customer;
    },
    enabled: Boolean(value),
    staleTime: 60_000,
    retry: false,
  });
  const selectedLabel = selected
    ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ''}`
    : isError ? 'Selected customer unavailable' : 'Loading selected customer...';

  function selectCustomer(customer: CustomerOption | null) {
    if (customer) queryClient.setQueryData(selectedCustomerKey(customer.id), customer);
    onChange(customer?.id ?? '');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full min-w-0 justify-start font-normal">
          <Users aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">Customer: {value ? selectedLabel : 'All customers'}</span>
          <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader className="pr-6">
          <DialogTitle>Filter by customer</DialogTitle>
          <DialogDescription>Choose a customer to see only their invoices.</DialogDescription>
        </DialogHeader>
        {open && <CustomerOptions value={value} onSelect={selectCustomer} />}
      </DialogContent>
    </Dialog>
  );
}
