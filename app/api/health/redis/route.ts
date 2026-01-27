import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function GET() {
  try {
    const startTime = Date.now();
    
    const result = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 5000)),
    ]);
    const responseTime = Date.now() - startTime;

    const info = await redis.info('server');
    const memoryInfo = await redis.info('memory');
    
    const testKey = `health:check:${Date.now()}`;
    await redis.setex(testKey, 10, 'ok');
    const testValue = await redis.get(testKey);
    await redis.del(testKey);

    const isHealthy = result === 'PONG' && testValue === 'ok';

    return NextResponse.json(
      {
        status: isHealthy ? 'healthy' : 'unhealthy',
        redis: {
          connected: result === 'PONG',
          responseTime: `${responseTime}ms`,
          writeReadTest: testValue === 'ok',
          serverInfo: info.split('\r\n').slice(0, 5).join('\n'),
          memoryInfo: memoryInfo.split('\r\n').slice(0, 3).join('\n'),
        },
        timestamp: new Date().toISOString(),
      },
      { status: isHealthy ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

