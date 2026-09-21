import path from 'node:path';
import { defineConfig } from 'vitest/config';

// No dotenv or application setup is loaded. The harness supplies a newly
// spawned loopback-only MongoDB replica set for every run.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/integration/supplier-*.integration.ts'],
    globalSetup: ['./tests/integration/supplier-global-setup.ts'],
    setupFiles: ['./tests/integration/supplier-test-setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
