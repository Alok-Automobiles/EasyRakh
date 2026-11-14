import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';

// Isolated backend for production browser profiling. Never loads .env.local's URI.
async function main() {
  const mongo = await MongoMemoryReplSet.create({
    binary: { version: '8.2.5' },
    replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' },
  });
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', process.env.PERFORMANCE_PORT || '3108'], {
    stdio: 'inherit',
    env: { ...process.env, MONGODB_URI: mongo.getUri('performance_fixture'),
      REDIS_HOST: '127.0.0.1', REDIS_PORT: '6379', JWT_SECRET: 'test-jwt-secret', GEMINI_API_KEY: 'test-gemini-key' },
  });
  const shutdown = () => { server.kill('SIGTERM'); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  server.once('exit', async (code) => {
    await mongo.stop();
    process.exit(code || 0);
  });
  server.once('error', async () => {
    await mongo.stop();
    process.exit(1);
  });
}
void main().catch(error => { console.error(error); process.exit(1); });
