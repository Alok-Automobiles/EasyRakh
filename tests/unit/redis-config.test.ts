import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const instance = {
    on: vi.fn(),
  };

  return {
    instance,
    Redis: vi.fn(function RedisMock() {
      return instance;
    }),
  };
});

vi.mock('ioredis', () => ({
  default: mocks.Redis,
}));

describe('Redis client configuration', () => {
  it('queues the first command while a lazy connection is starting', async () => {
    await import('@/lib/redis');

    expect(mocks.Redis).toHaveBeenCalledWith(
      6379,
      '127.0.0.1',
      expect.objectContaining({
        lazyConnect: true,
        enableOfflineQueue: true,
        enableReadyCheck: true,
      })
    );
  });
});
