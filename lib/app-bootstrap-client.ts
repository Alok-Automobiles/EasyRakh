'use client';

// Share simultaneous header/sidebar/page loads, without retaining account data
// across navigations or sign-outs. Each caller receives its own response body.
let pendingBootstrap: Promise<Response> | null = null;
export async function fetchAppBootstrap(): Promise<Response> {
  if (!pendingBootstrap) {
    pendingBootstrap = fetch('/api/bootstrap').finally(() => { pendingBootstrap = null; });
  }
  return (await pendingBootstrap).clone();
}
