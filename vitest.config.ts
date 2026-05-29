import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const webProject = {
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
} as const;

const unitProject = {
  name: 'unit',
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/web/**/*.test.{ts,tsx}'],
  },
} as const;

// Coverage excludes src/web, so browser-project execution adds Playwright dependency
// without contributing to the reported coverage metrics.
const isCoverageRun = process.argv.includes('--coverage');

export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: isCoverageRun ? [unitProject] : [webProject, unitProject],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/web/**', 'src/cli.ts', 'src/server/main.ts'],
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
