import { AsyncLocalStorage } from 'node:async_hooks';
import type { MongoClient } from 'mongodb';

type Stage = 'db' | 'redis' | 'summary';
type Timings = Partial<Record<Stage, number>>;
const timingStorage = new AsyncLocalStorage<Timings>();

export function currentTimings() { return timingStorage.getStore(); }

export function monitorDatabaseTiming(client: MongoClient) {
  const commands = new Map<number, { start: number; timings: Timings }>();
  client.on('commandStarted', (event) => {
    const timings = currentTimings();
    if (timings) commands.set(event.requestId, { start: performance.now(), timings });
  });
  const finish = (event: { requestId: number }) => {
    const command = commands.get(event.requestId);
    if (!command) return;
    command.timings.db = (command.timings.db || 0) + performance.now() - command.start;
    commands.delete(event.requestId);
  };
  client.on('commandSucceeded', finish);
  client.on('commandFailed', finish);
}

export async function timeStage<T>(stage: Stage, task: () => Promise<T>): Promise<T> {
  const timings = currentTimings();
  const start = performance.now();
  try { return await task(); }
  finally {
    if (timings) timings[stage] = (timings[stage] || 0) + performance.now() - start;
  }
}

// Route is a source-code template, never a URL containing account identifiers.
export function withRequestTiming<Args extends unknown[], R extends Response>(
  route: string, handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return (...args) => timingStorage.run({}, async () => {
    const start = performance.now();
    const timings = currentTimings()!;
    let status = 500;
    try {
      const response = await handler(...args);
      status = response.status;
      response.headers.set('Server-Timing', [
        `total;dur=${(performance.now() - start).toFixed(1)}`,
        ...Object.entries(timings).map(([name, value]) => `${name};dur=${value!.toFixed(1)}`),
      ].join(', '));
      return response;
    } finally {
      if (process.env.PERFORMANCE_LOGGING === '1') {
        console.info(JSON.stringify({ event: 'request_performance', route, status,
          totalMs: Math.round(performance.now() - start), ...timings }));
      }
    }
  });
}
