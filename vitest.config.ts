import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['frontend/**/*.test.ts', 'frontend/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    globals: false,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend'),
    },
  },
});
