import { expect, it, vi } from 'vitest';
import { fetchAppBootstrap } from '@/lib/app-bootstrap-client';
import { QueryClient } from '@tanstack/react-query';

it('shares concurrent bootstrap calls and returns independently readable bodies without caching account data', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
    .mockResolvedValueOnce(Response.json({ user: { id: 'next-user' } }));
  const calls = [fetchAppBootstrap(), fetchAppBootstrap(), fetchAppBootstrap()];
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(Response.json({ user: { id: 'first-user' } }));
  const responses = await Promise.all(calls);
  expect(await Promise.all(responses.map(response => response.json()))).toEqual(Array(3).fill({ user: { id: 'first-user' } }));
  expect(await (await fetchAppBootstrap()).json()).toEqual({ user: { id: 'next-user' } });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockRestore();
});

it('reuses bootstrap across navigations, refreshes after invalidation, and clears between accounts', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ user: { id: 'first' }, collectionTypes: [] }))
    .mockResolvedValueOnce(Response.json({ user: { id: 'updated' }, collectionTypes: [] }))
    .mockResolvedValueOnce(Response.json({ user: { id: 'next-account' }, collectionTypes: [] }));
  try {
    const first = await fetchAppBootstrap(client);
    expect((await first.json()).user.id).toBe('first');
    expect((await (await fetchAppBootstrap(client)).json()).user.id).toBe('first');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ['bootstrap'] });
    expect((await (await fetchAppBootstrap(client)).json()).user.id).toBe('updated');
    await client.cancelQueries();
    client.clear();
    expect((await (await fetchAppBootstrap(client)).json()).user.id).toBe('next-account');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  } finally { client.clear(); fetchMock.mockRestore(); }
});
