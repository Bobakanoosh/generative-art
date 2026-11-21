import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    // `*.slow.test.ts` run alone via `npm run test:slow` (vitest.slow.config.ts).
    exclude: ['**/node_modules/**', '**/*.slow.test.ts', '**/*.slow.test.tsx'],
  },
});
