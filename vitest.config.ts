import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'references/compiled/**', 'tmp/**'],
    testTimeout: 15000,
  },
});
