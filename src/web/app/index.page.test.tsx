import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { Dashboard } from './index.page';

const mockState = {
  generated_at: '2024-01-15T10:00:00Z',
  counts: { running: 2, retrying: 1 },
  running: [
    {
      issue_id: 'ISS-001',
      issue_identifier: 'PROJ-42',
      turn_count: 5,
      started_at: new Date(Date.now() - 120_000).toISOString(),
      attempt: 1,
    },
    {
      issue_id: 'ISS-002',
      issue_identifier: 'PROJ-43',
      turn_count: 12,
      started_at: new Date(Date.now() - 300_000).toISOString(),
      attempt: null,
    },
  ],
  retrying: [
    {
      issue_id: 'ISS-003',
      identifier: 'PROJ-44',
      attempt: 3,
      due_at_ms: Date.now() + 60_000,
      error: 'Rate limited',
    },
  ],
  agent_totals: {
    input_tokens: 1_250_000,
    output_tokens: 420_000,
    total_tokens: 1_670_000,
    seconds_running: 3600,
  },
  rate_limits: { requests_remaining: 120, reset_at: '2024-01-15T11:00:00Z' },
};

const createMockResponse = (body: unknown) => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe('Dashboard', () => {
  let fetchSpy: { mockRestore: () => void; mockResolvedValue: (v: Response) => void };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createMockResponse(mockState));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders dashboard header with system status', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    const titles = await screen.findAllByText('Symphony Dashboard');
    expect(titles.length).toBeGreaterThan(0);

    const badges = await screen.findAllByText('Healthy');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('displays running sessions with sortable columns', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryAllByText('PROJ-42').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('PROJ-43').length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText('Running Sessions').length).toBeGreaterThan(0);
  });

  it('displays retry queue with countdown', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryAllByText('PROJ-44').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('Rate limited').length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText('Retry Queue').length).toBeGreaterThan(0);
  });

  it('displays token usage summary', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryAllByText('Token Usage').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('1.67M').length).toBeGreaterThan(0);
    });
  });

  it('displays runtime statistics', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryAllByText('Runtime').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('Active Sessions').length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText('2').length).toBeGreaterThan(0);
  });

  it('sets up auto-refresh interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const intervalCalls = setIntervalSpy.mock.calls.filter((args) => {
      const interval = typeof args[1] === 'number' ? args[1] : 0;
      return interval === 8000;
    });

    expect(intervalCalls.length).toBeGreaterThan(0);

    setIntervalSpy.mockRestore();
  });

  it('shows empty states when no data', async () => {
    fetchSpy.mockResolvedValue(
      createMockResponse({
        generated_at: new Date().toISOString(),
        counts: { running: 0, retrying: 0 },
        running: [],
        retrying: [],
        agent_totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          seconds_running: 0,
        },
        rate_limits: null,
      }),
    );

    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryAllByText('No active sessions').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('No retry queue items').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('No token usage recorded yet').length).toBeGreaterThan(0);
    });
  });
});
