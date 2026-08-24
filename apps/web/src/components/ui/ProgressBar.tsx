import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  label?: string;
}

export function ProgressBar({ value, max = 100, className, label }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brand-gradient transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
