import { cn } from '@/lib/utils';

/**
 * Coverage %, budget used, packing progress — one bar, used everywhere.
 *
 * ROVE_BRAND_SPEC v3 §2.3 lists "progress fills" as a SOLID-accent job, which
 * is why the default tone is the room's solid half rather than its light one:
 * a bar is a few pixels tall, so it is exactly the small-and-loud element the
 * saturation is being saved for. The track underneath is §2.1's gray.
 *
 * The four hue tones v2 had are gone. A bar took `tone="green"` to mean "this
 * one is money" and `tone="blue"` to mean "this one is the plan", which is the
 * per-component colour meaning §2.5 replaces: a bar inside Documents is orange
 * because the screen is, and it needs no argument about which hue money is.
 */
const FILL = {
  /** The room's solid accent. The default, and almost always right. */
  feature: 'bg-feature-solid',
  /** For a bar on a surface that is already the feature colour — a solid fill
   *  on its own light fill is legible, but flat ink is the stronger read when
   *  the bar is the point of the card. */
  ink: 'bg-ink',
} as const;

export function Progress({
  value,
  tone = 'feature',
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
