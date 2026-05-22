import { cn } from '@/web/lib/utils';

type Status = 'healthy' | 'degraded' | 'error' | 'active' | 'idle';

const statusConfig: Record<Status, { label: string; dotClass: string; pulse?: boolean }> = {
  healthy: {
    label: 'Healthy',
    dotClass: 'bg-emerald-500',
    pulse: false,
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-amber-500',
    pulse: true,
  },
  error: {
    label: 'Error',
    dotClass: 'bg-rose-500',
    pulse: true,
  },
  active: {
    label: 'Active',
    dotClass: 'bg-cyan-500',
    pulse: true,
  },
  idle: {
    label: 'Idle',
    dotClass: 'bg-muted-foreground/60',
    pulse: false,
  },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
        'bg-background/80 backdrop-blur-sm',
        className,
      )}
    >
      <span className="relative flex size-2">
        {config.pulse === true && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              config.dotClass,
            )}
          />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', config.dotClass)} />
      </span>
      {config.label}
    </div>
  );
}
