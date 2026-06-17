'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import KeyboardNavigation from '@/components/KeyboardNavigation';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
            gcTime: 30 * 60 * 1000, // 30 minutes - cache retention
            refetchOnWindowFocus: false,
            refetchOnMount: true, // Refetch on mount if data is stale (after invalidation)
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <KeyboardNavigation />
    </QueryClientProvider>
  );
}
