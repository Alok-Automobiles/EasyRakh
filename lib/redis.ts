import Redis from 'ioredis';

if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
  throw new Error("REDIS_HOST and REDIS_PORT are required");
}

const redis = new Redis(Number(process.env.REDIS_PORT), process.env.REDIS_HOST, {
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  enableReadyCheck: true,
  enableOfflineQueue: false,
  connectTimeout: 10000,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  console.log('✅ Redis ready');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});

redis.on('close', () => {
  console.warn('⚠️ Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
  console.log(`🔄 Redis reconnecting in ${delay}ms...`);
});

redis.on('end', () => {
  console.warn('⚠️ Redis connection ended');
});

export async function deleteByPattern(pattern: string): Promise<number> {
  let deleted = 0;
  const stream = redis.scanStream({ match: pattern, count: 100 });

  return new Promise((resolve, reject) => {
    stream.on('data', (keys: string[]) => {
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        pipeline.exec().then(() => {
          deleted += keys.length;
        }).catch(reject);
      }
    });
    stream.on('end', () => resolve(deleted));
    stream.on('error', reject);
  });
}

export default redis;