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
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/web/**',
        'src/main.ts',
        // External API / Integration boundary files — tested via E2E/integration
        'src/server/app/issues/adapters/linear.ts',
        'src/server/app/issues/adapters/jira.ts',
        'src/server/app/agents/workflows/runAgentSession.ts',
        'src/server/app/agents/workflows/createPiSession.ts',
        'src/server/app/agents/services/ticketTools.ts',
        'src/server/app/config/workflows/dynamicReload.ts',
        // Bootstrap / orchestration entry points — tested via integration
        'src/server/app/bootstrap.ts',
        'src/server/app/issues/adapters/adapterFactory.ts',
        'src/server/app/issues/adapters/jiraAdapter.ts',
        'src/server/app/issues/adapters/linearAdapter.ts',
        'src/server/app/issues/workflows/fetchIssues.ts',
        'src/server/app/orchestrator/workflows/pollTick.ts',
        'src/server/app/workspaces/workflows/ensureWorkspace.ts',
        'src/server/app/logs/workflows/writeLog.ts',
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
