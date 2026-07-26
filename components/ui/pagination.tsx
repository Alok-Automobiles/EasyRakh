'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  disabled?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  disabled = false,
}: PaginationProps) {
  const [pageInput, setPageInput] = React.useState(currentPage.toString());
  const pageInputId = React.useId();

  React.useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  if (totalPages <= 1) {
    return null;
  }

  const commitPageInput = () => {
    const requestedPage = Number(pageInput);

    if (!Number.isFinite(requestedPage)) {
      setPageInput(currentPage.toString());
      return;
    }

    const nextPage = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage)));
    setPageInput(nextPage.toString());
    if (nextPage !== currentPage) onPageChange(nextPage);
  };

  const goToPage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitPageInput();
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex w-full items-center justify-center gap-1',
        className
      )}
    >
      <span className="sr-only">
        Page {currentPage} of {totalPages}
      </span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={disabled || currentPage <= 1}
        className="h-9 w-9 shrink-0 rounded-full border-transparent p-0 text-gray-600 shadow-none hover:bg-gray-100"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <form noValidate onSubmit={goToPage}>
        <Input
          id={pageInputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={totalPages}
          step={1}
          value={pageInput}
          onChange={(event) => setPageInput(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={commitPageInput}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitPageInput();
            }
            if (event.key === 'Escape') {
              setPageInput(currentPage.toString());
              event.currentTarget.blur();
            }
          }}
          disabled={disabled}
          aria-label={`Current page. Enter a number from 1 to ${totalPages}`}
          className="h-9 w-14 appearance-none border-transparent bg-transparent px-1 text-center text-base font-semibold tabular-nums shadow-none hover:bg-gray-100 focus:bg-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </form>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={disabled || currentPage >= totalPages}
        className="h-9 w-9 shrink-0 rounded-full border-transparent p-0 text-gray-600 shadow-none hover:bg-gray-100"
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <span className="ml-1 whitespace-nowrap text-sm font-medium text-gray-500">
        out of {totalPages.toLocaleString('en-IN')}
      </span>
    </nav>
  );
}
