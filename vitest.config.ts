import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import TsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [viteReact(), TsconfigPaths()],
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
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/web/**',
        'src/main.ts',
        // External API integration files - tested via manual/E2E
        'src/server/app/issues/adapters/linear.ts',
        'src/server/app/issues/adapters/jira.ts',
        'src/server/app/agents/workflows/runAgentSession.ts',
        // Network/API-dependent tools tested via integration
        'src/server/app/agents/services/ticketTools.ts',
        // Filesystem watcher tested via integration
        'src/server/app/config/workflows/dynamicReload.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
});
