import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Long-running tests (e.g. the 100 000-step murmuration render), run on their
 * own, one file at a time, so they neither slow down nor time out against the
 * parallel `npm test` suite.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.slow.test.ts', 'tests/**/*.slow.test.ts'],
    fileParallelism: false,
  },
});
