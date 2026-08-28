import { StarBurst } from '@/components/brand/doodle';
import { cn } from '@/lib/utils';

/**
 * The eyebrow above a section, with an optional right-hand action.
 *
 * `.section-label` carries the type (ROVE_BRAND_SPEC §3): 11px, +0.08em, and
 * sentence case — it used to be ALL CAPS, which §3 now allows nowhere.
 */
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

/**
 * A number with its caption — stats grid, budget headline, trip counters.
 *
 * `mark` opts into the star burst, which §4.2 puts next to numbers and claims.
 * It is off by default: a grid of stats each wearing one would be the doodle
 * wallpaper §7 rules out, so the caller picks the single figure worth it.
 */
export function Stat({
  value,
  label,
  hint,
  mark = false,
  className,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  mark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      {mark ? <StarBurst className="text-pink absolute -top-2 -left-4 size-6" /> : null}
      <div className="font-display text-ink relative text-2xl leading-none font-bold tracking-tight">
        {value}
      </div>
      <div className="text-muted mt-1.5 text-xs font-medium">{label}</div>
      {hint ? <div className="text-muted/70 mt-0.5 text-[11px]">{hint}</div> : null}
    </div>
  );
}
