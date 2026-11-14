'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';

// Share simultaneous header/sidebar/page loads, without retaining account data
// across navigations or sign-outs. Each caller receives its own response body.
let pendingBootstrap: Promise<Response> | null = null;
export async function fetchAppBootstrap(client?: QueryClient): Promise<Response> {
  if (client) {
    try { return Response.json(await client.fetchQuery(bootstrapOptions)); }
    catch (error) { return new Response(null, { status: error instanceof BootstrapError ? error.status : 500 }); }
  }
  if (!pendingBootstrap) {
    pendingBootstrap = fetch('/api/bootstrap').finally(() => { pendingBootstrap = null; });
  }
  return (await pendingBootstrap).clone();
}

export interface AppBootstrap {
  user: { id: string; name: string; email: string; isAdmin?: boolean;
    firmTitle?: string; gstNumber?: string; firmPhone?: string; firmEmail?: string; firmAddress?: string };
  collectionTypes: Array<{ id: string; name: string; slug: string; lastTransactionDate?: string }>;
}
class BootstrapError extends Error {
  constructor(public status: number) { super('Bootstrap request failed'); }
}
export const bootstrapOptions = {
  queryKey: ['bootstrap'],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<AppBootstrap> => {
    const response = await fetch('/api/bootstrap', { signal });
    if (!response.ok) throw new BootstrapError(response.status);
    return response.json();
  },
  staleTime: 5 * 60_000,
  retry: false,
};
export function useAppBootstrap(enabled = true) {
  return useQuery({ ...bootstrapOptions, enabled });
}
