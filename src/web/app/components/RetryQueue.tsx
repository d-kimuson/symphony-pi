import { AlertTriangle, Clock, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/web/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/web/components/ui/table';

export type RetryRow = {
  readonly issue_id: string;
  readonly identifier: string;
  readonly attempt: number;
  readonly due_at_ms: number;
  readonly error: string | null;
};

function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, targetMs - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  return remaining;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Due now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function RetryQueue({ retries }: { retries: readonly RetryRow[] }) {
  if (retries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <RotateCcw className="size-8 opacity-40" />
        <p className="text-sm">No retry queue items</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Issue ID</TableHead>
            <TableHead>Identifier</TableHead>
            <TableHead>Attempt</TableHead>
            <TableHead>Retry In</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {retries.map((row) => (
            <RetryRowItem key={row.issue_id} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RetryRowItem({ row }: { row: RetryRow }) {
  const remaining = useCountdown(row.due_at_ms);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.issue_id}</TableCell>
      <TableCell className="font-medium">{row.identifier}</TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono tabular-nums">
          #{row.attempt}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <Clock className="size-3 text-amber-500" />
          <span
            className={remaining <= 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {formatDuration(remaining)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {row.error != null ? (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3 shrink-0" />
            <span className="max-w-[240px] truncate">{row.error}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
