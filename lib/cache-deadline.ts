import { timeStage } from './request-timing';

const COOLDOWN_MS = 5_000;
let unavailableUntil = 0;

/** Optional cache work only. Never use this for locks, rate limits, or money writes. */
export async function optionalCache<T>(
  task: () => Promise<T>, fallback: T, timeoutMs = 150,
): Promise<T> {
  if (Date.now() < unavailableUntil) return fallback;
  return timeStage('redis', async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task(),
        new Promise<T>((resolve) => {
          timer = setTimeout(() => {
            unavailableUntil = Date.now() + COOLDOWN_MS;
            resolve(fallback);
          }, timeoutMs);
        }),
      ]);
    } catch {
      unavailableUntil = Date.now() + COOLDOWN_MS;
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
}
