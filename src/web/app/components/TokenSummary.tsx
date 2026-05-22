import { Cpu } from 'lucide-react';

import { Progress, ProgressTrack, ProgressIndicator } from '../../components/ui/progress';

export type TokenTotals = {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly total_tokens: number;
};

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export const TokenSummary = ({ totals }: { totals: TokenTotals }) => {
  const max = Math.max(totals.total_tokens, 1);
  const inputPct = Math.round((totals.input_tokens / max) * 100);
  const outputPct = Math.round((totals.output_tokens / max) * 100);

  return (
    <div className="space-y-5">
      {totals.total_tokens === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
          <Cpu className="size-8 opacity-40" />
          <p className="text-sm">No token usage recorded yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Input Tokens</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatNumber(totals.input_tokens)}
              </span>
            </div>
            <Progress value={inputPct}>
              <ProgressTrack>
                <ProgressIndicator className="bg-emerald-500" />
              </ProgressTrack>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {inputPct}%
              </span>
            </Progress>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Output Tokens</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatNumber(totals.output_tokens)}
              </span>
            </div>
            <Progress value={outputPct}>
              <ProgressTrack>
                <ProgressIndicator className="bg-cyan-500" />
              </ProgressTrack>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {outputPct}%
              </span>
            </Progress>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Tokens</span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {formatNumber(totals.total_tokens)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
