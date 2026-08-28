import { cn } from '@/lib/utils';

const FILL = {
  primary: 'bg-primary',
  green: 'bg-green',
  blue: 'bg-blue',
  yellow: 'bg-yellow',
  pink: 'bg-pink',
  ink: 'bg-ink',
} as const;

/** Coverage %, budget used, packing progress — one bar, used everywhere. */
export function Progress({
  value,
  tone = 'primary',
  className,
  label,
}: {
  /** 0–1; anything above 1 clamps so an over-budget bar stays inside its track. */
  value: number;
  tone?: keyof typeof FILL;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div
      className={cn('bg-surface h-2 w-full overflow-hidden rounded-full', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-all', FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
