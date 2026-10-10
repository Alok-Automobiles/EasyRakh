'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

export interface AppBootstrap {
  user: {
    id: string;
    name: string;
    email: string;
    isAdmin?: boolean;
    firmTitle?: string;
    gstNumber?: string;
    firmPhone?: string;
    firmEmail?: string;
    firmAddress?: string;
  };
  collectionTypes: Array<{
    id: string;
    name: string;
    slug: string;
    lastTransactionDate?: string;
  }>;
  supplierPaymentsEnabled?: boolean;
}

export class BootstrapRequestError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? 'Unauthorized' : 'Unable to load your account');
  }
}

// Share simultaneous header/sidebar/page loads, without retaining account data
// across navigations or sign-outs. Each caller receives its own response body.
let pendingBootstrap: Promise<Response> | null = null;
export async function fetchAppBootstrap(): Promise<Response> {
  if (!pendingBootstrap) {
    pendingBootstrap = fetch('/api/bootstrap').finally(() => { pendingBootstrap = null; });
  }
  return (await pendingBootstrap).clone();
}

export const appBootstrapQuery = queryOptions({
  queryKey: ['app-bootstrap'],
  queryFn: async (): Promise<AppBootstrap> => {
    const response = await fetchAppBootstrap();
    if (!response.ok) throw new BootstrapRequestError(response.status);
    return response.json();
  },
  staleTime: 5 * 60 * 1000,
  retry: false,
  refetchOnWindowFocus: true,
});

export function useAppBootstrap(enabled = true) {
  return useQuery({ ...appBootstrapQuery, enabled });
}
