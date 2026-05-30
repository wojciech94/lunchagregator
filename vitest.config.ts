import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./__tests__/setup.ts'],
    include: [
      '__tests__/unit/**/*.test.ts',
      '__tests__/unit/**/*.test.tsx',
      '__tests__/properties/**/*.test.ts',
      '__tests__/properties/**/*.property.test.ts',
      '__tests__/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/types/**',
        'src/app/layout.tsx',
        'src/app/globals.css',
      ],
    },
  },
});
