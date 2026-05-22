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
    // oxlint-disable-next-line typescript/no-unsafe-call
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

    const title = await screen.findByText('Symphony Dashboard');
    expect(title).toBeDefined();

    const healthy = await screen.findByText('Healthy');
    expect(healthy).toBeDefined();
  });

  it('displays running sessions with sortable columns', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('PROJ-42')).toBeDefined();
      expect(screen.getByText('PROJ-43')).toBeDefined();
    });

    expect(screen.getByText('Running Sessions')).toBeDefined();
  });

  it('displays retry queue with countdown', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('PROJ-44')).toBeDefined();
      expect(screen.getByText('Rate limited')).toBeDefined();
    });

    expect(screen.getByText('Retry Queue')).toBeDefined();
  });

  it('displays token usage summary', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Token Usage')).toBeDefined();
      expect(screen.getByText('1.67M')).toBeDefined();
    });
  });

  it('displays runtime statistics', async () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Runtime')).toBeDefined();
      expect(screen.getByText('Active Sessions')).toBeDefined();
    });

    expect(screen.getByText('2')).toBeDefined();
  });

  it('auto-refetches state on interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Advance past the 8s refetch interval
    vi.advanceTimersByTime(10_000);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });

  it('shows empty states when no data', async () => {
    // oxlint-disable-next-line typescript/no-unsafe-call
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
      expect(screen.getByText('No active sessions')).toBeDefined();
      expect(screen.getByText('No retry queue items')).toBeDefined();
      expect(screen.getByText('No token usage recorded yet')).toBeDefined();
    });
  });
});
