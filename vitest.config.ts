import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'references/compiled/**', 'tmp/**'],
    // 120s: Phase B skill tests spawn `claude -p` subprocess with Sonnet inference (30-90s per call)
    testTimeout: 120_000,
  },
});
