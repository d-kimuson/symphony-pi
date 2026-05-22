import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Activity, BarChart3, Clock, Cpu, RefreshCw, Server, Shield } from 'lucide-react';
import { useMemo } from 'react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';
import { honoClient } from '../lib/api/client';
import { RetryQueue } from './components/RetryQueue';
import { RuntimeStats } from './components/RuntimeStats';
import { SessionsTable } from './components/SessionsTable';
import { StatusBadge } from './components/StatusBadge';
import { TokenSummary } from './components/TokenSummary';

type ApiState = {
  generated_at: string;
  counts: {
    running: number;
    retrying: number;
  };
  running: Array<{
    issue_id: string;
    issue_identifier: string;
    turn_count: number;
    started_at: string;
    attempt: number | null;
  }>;
  retrying: Array<{
    issue_id: string;
    identifier: string;
    attempt: number;
    due_at_ms: number;
    error: string | null;
  }>;
  agent_totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    seconds_running: number;
  };
  rate_limits: Record<string, unknown> | null;
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const typedClient = honoClient as {
  api: { v1: { state: { $get: () => Promise<Response> } } };
};

const fetchState = async (): Promise<ApiState> => {
  const res = await typedClient.api.v1.state.$get();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (await res.json()) as ApiState;
};

const useDashboardState = () => {
  return useQuery({
    queryKey: ['dashboard-state'],
    queryFn: fetchState,
    refetchInterval: 8000,
    refetchIntervalInBackground: true,
    retry: 2,
  });
};

const deriveHealth = (state: ApiState | undefined): 'healthy' | 'degraded' | 'error' => {
  if (!state) return 'error';
  if (state.retrying.length > 3) return 'degraded';
  return 'healthy';
};

export const Dashboard = () => {
  const { data, isLoading, isError, dataUpdatedAt } = useDashboardState();
  const health = deriveHealth(data);

  const runtimeData = useMemo(
    () => ({
      seconds_running: data?.agent_totals.seconds_running ?? 0,
      running_count: data?.counts.running ?? 0,
      completed_count: 0,
    }),
    [data],
  );

  const lastUpdated = useMemo(() => {
    if (!dataUpdatedAt) return '—';
    return new Date(dataUpdatedAt).toLocaleTimeString('ja-JP');
  }, [dataUpdatedAt]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/50">
              <Server className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Symphony Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                System observability &amp; runtime metrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={health} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3" />
              <span>{lastUpdated}</span>
            </div>
          </div>
        </header>

        <Separator className="mb-8" />

        {/* Runtime Stats */}
        <section className="mb-8">
          {isLoading || !data ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ) : (
            <RuntimeStats data={runtimeData} />
          )}
        </section>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sessions */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-cyan-500" />
                <CardTitle className="text-sm font-semibold">Running Sessions</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {data?.counts.running ?? 0} active automation sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-2 py-10 text-destructive">
                  <Shield className="size-6" />
                  <p className="text-sm">Failed to load sessions</p>
                </div>
              ) : (
                <SessionsTable sessions={data?.running ?? []} />
              )}
            </CardContent>
          </Card>

          {/* Token Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-emerald-500" />
                <CardTitle className="text-sm font-semibold">Token Usage</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Cumulative LLM token consumption
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-2 py-10 text-destructive">
                  <Shield className="size-6" />
                  <p className="text-sm">Failed to load token data</p>
                </div>
              ) : (
                <TokenSummary
                  totals={
                    data?.agent_totals ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Retry Queue */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-amber-500" />
                <CardTitle className="text-sm font-semibold">Retry Queue</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {data?.counts.retrying ?? 0} items awaiting retry
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-2 py-10 text-destructive">
                  <Shield className="size-6" />
                  <p className="text-sm">Failed to load retry queue</p>
                </div>
              ) : (
                <RetryQueue retries={data?.retrying ?? []} />
              )}
            </CardContent>
          </Card>

          {/* Rate Limits */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Rate Limits</CardTitle>
              </div>
              <CardDescription className="text-xs">Current API rate limit status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : isError ? (
                <div className="flex flex-col items-center gap-2 py-6 text-destructive">
                  <Shield className="size-6" />
                  <p className="text-sm">Failed to load rate limits</p>
                </div>
              ) : data?.rate_limits && Object.keys(data.rate_limits).length > 0 ? (
                <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-xs font-mono">
                  {JSON.stringify(data.rate_limits, null, 2)}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
                  <BarChart3 className="size-6 opacity-40" />
                  <p className="text-sm">No rate limit data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Symphony &middot; Auto-refreshing every 8s
        </footer>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: Dashboard,
});
