import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        name: 'web',
        plugins: [viteReact()],
        test: {
          include: ['src/web/**/*.test.{ts,tsx}'],
          exclude: [],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
          },
        },
      },
      {
        name: 'unit',
        test: {
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/web/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/web/**', 'src/main.ts'],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 70,
        lines: 75,
      },
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
});
