import { ArrowUp, ArrowUpDown, ArrowDown, Activity } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/web/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/web/components/ui/table';
import { cn } from '@/web/lib/utils';

export type SessionRow = {
  readonly issue_id: string;
  readonly issue_identifier: string;
  readonly turn_count: number;
  readonly started_at: string;
  readonly attempt: number | null;
};

type SortKey = keyof SessionRow;
type SortDir = 'asc' | 'desc';

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const SortHeader = ({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) => {
  const isActive = currentKey === sortKey;
  return (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        <span className="inline-flex size-3.5 items-center justify-center">
          {isActive ? (
            currentDir === 'asc' ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 opacity-40" />
          )}
        </span>
      </div>
    </TableHead>
  );
};

export const SessionsTable = ({ sessions }: { sessions: readonly SessionRow[] }) => {
  const [sortKey, setSortKey] = useState<SortKey>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const rows = [...sessions];
    rows.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [sessions, sortKey, sortDir]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Activity className="size-8 opacity-40" />
        <p className="text-sm">No active sessions</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHeader
              label="Issue ID"
              sortKey="issue_id"
              currentKey={sortKey}
              currentDir={sortDir}
              onSort={handleSort}
            />
            <SortHeader
              label="Identifier"
              sortKey="issue_identifier"
              currentKey={sortKey}
              currentDir={sortDir}
              onSort={handleSort}
            />
            <SortHeader
              label="Turns"
              sortKey="turn_count"
              currentKey={sortKey}
              currentDir={sortDir}
              onSort={handleSort}
            />
            <SortHeader
              label="Started"
              sortKey="started_at"
              currentKey={sortKey}
              currentDir={sortDir}
              onSort={handleSort}
            />
            <SortHeader
              label="Attempt"
              sortKey="attempt"
              currentKey={sortKey}
              currentDir={sortDir}
              onSort={handleSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.issue_id}>
              <TableCell className="font-mono text-xs">{row.issue_id}</TableCell>
              <TableCell className="font-medium">{row.issue_identifier}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono tabular-nums">
                  {row.turn_count}
                </Badge>
              </TableCell>
              <TableCell>
                <TooltipDate iso={row.started_at} />
              </TableCell>
              <TableCell className="font-mono text-xs">{row.attempt ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const TooltipDate = ({ iso }: { iso: string }) => {
  return (
    <span className="group relative cursor-help">
      <span className="font-mono text-xs text-muted-foreground">{formatRelativeTime(iso)}</span>
      <span
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2',
          'rounded-md bg-foreground px-2 py-1 text-xs text-background',
          'opacity-0 transition-opacity group-hover:opacity-100',
        )}
      >
        {formatDate(iso)}
      </span>
    </span>
  );
};
