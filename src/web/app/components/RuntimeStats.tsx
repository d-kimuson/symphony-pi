import { Timer, Zap, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export type RuntimeData = {
  readonly seconds_running: number;
  readonly running_count: number;
  readonly completed_count: number;
};

const formatDuration = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
};

function LiveUptime({ baseSeconds }: { baseSeconds: number }) {
  const [elapsed, setElapsed] = useState(baseSeconds);

  useEffect(() => {
    setElapsed(baseSeconds);
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [baseSeconds]);

  return (
    <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
      {formatDuration(elapsed)}
    </span>
  );
}

export function RuntimeStats({ data }: { data: RuntimeData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        icon={<Timer className="size-4 text-cyan-500" />}
        label="Runtime"
        value={<LiveUptime baseSeconds={data.seconds_running} />}
      />
      <StatCard
        icon={<Zap className="size-4 text-amber-500" />}
        label="Active Sessions"
        value={
          <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
            {data.running_count}
          </span>
        }
      />
      <StatCard
        icon={<CheckCircle2 className="size-4 text-emerald-500" />}
        label="Completed"
        value={
          <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
            {data.completed_count}
          </span>
        }
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      {value}
    </div>
  );
}
