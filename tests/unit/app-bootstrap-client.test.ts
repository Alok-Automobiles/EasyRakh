import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { appBootstrapQuery, fetchAppBootstrap } from '@/lib/app-bootstrap-client';

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

it('reuses bootstrap across warm navigation and removes account data on account change', async () => {
  const queryClient = new QueryClient();
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ user: { id: 'first-user' }, collectionTypes: [], supplierPaymentsEnabled: true }))
    .mockResolvedValueOnce(Response.json({ user: { id: 'second-user' }, collectionTypes: [], supplierPaymentsEnabled: false }));

  expect((await queryClient.fetchQuery(appBootstrapQuery)).user.id).toBe('first-user');
  expect((await queryClient.fetchQuery(appBootstrapQuery)).user.id).toBe('first-user');
  expect(fetchMock).toHaveBeenCalledTimes(1);

  queryClient.clear();
  expect((await queryClient.fetchQuery(appBootstrapQuery)).user.id).toBe('second-user');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockRestore();
});
