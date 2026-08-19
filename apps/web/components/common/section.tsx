import { cn } from '@/lib/utils';

/** Uppercase Prompt section label with an optional right-hand action (§15). */
export function SectionHeader({
  label,
  action,
  className,
}: {
  label: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2.5 flex items-baseline justify-between gap-3', className)}>
      <h2 className="section-label">{label}</h2>
      {action}
    </div>
  );
}

/** A number with its caption — stats grid, budget headline, trip counters. */
export function Stat({
  value,
  label,
  hint,
  className,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="font-display text-espresso text-2xl leading-none font-extrabold">{value}</div>
      <div className="text-muted mt-1.5 text-xs font-medium">{label}</div>
      {hint ? <div className="text-muted/70 mt-0.5 text-[11px]">{hint}</div> : null}
    </div>
  );
}
