import { cn } from '@/lib/utils';

/**
 * The only card in the app (ROVE_BRAND_SPEC §5 Cards).
 *
 * Two kinds and no third: a flat brand-colour block, or white with a hairline
 * on it. No shadows, and no border on a coloured one — the page separates
 * things with cream against white and with flat colour, never with elevation.
 *
 * WHY THE COLOURED CARDS ARE TINTED RATHER THAN FULL STRENGTH
 * §5 asks for a "flat brand colour fill", and §2.3 caps yellow+blue at 10% of
 * the page and pink+green at 5%. Both cannot hold at once in a six-card grid:
 * full strength there would put the page at well over half saturated colour
 * and break §2.3's "never place two saturated blocks adjacent" outright. So a
 * card surface is the colour laid over the page at low alpha — still one flat
 * fill, still hard-edged, still carrying its matching `-deep` type — and full
 * strength is kept for the things §2.3 has room for: pills, the primary
 * button, and the one highlight block per section.
 *
 * `accent` names a meaning, not a hue, and §2.4 locks which is which:
 *
 *   yellow  planning, dates, the trip itself
 *   blue    action, booking
 *   green   money, budget, split, confirmed
 *   pink    people, friends, community, sharing
 */
const ACCENT = {
  /** White on the cream page. The default, and what most cards should be —
   *  §2.3 wants 60% of the page breathing. */
  none: 'bg-surface border-border border',
  /* Alpha is tuned per hue rather than shared: at one value the yellow block
   * reads far stronger than the blue one, because these four differ in
   * luminance much more than they differ in saturation. */
  yellow: 'bg-yellow/25 text-yellow-deep',
  blue: 'bg-blue/18 text-blue-deep',
  green: 'bg-green/18 text-green-deep',
  pink: 'bg-pink/25 text-pink-deep',
  /** Full-strength ink — at most one per screen, for the moment that matters.
   *  The type is `text-bg`, not `text-cream`: on the admin surface ink and the
   *  page swap places, and only the pair that is defined in both scopes stays
   *  legible there. */
  ink: 'bg-ink text-bg',
  /* Kept because the API still emits them on characters, destinations and
   * budget categories. `primary` is blue by §2.4 (action), and `solid` was
   * always "the loud one", which is now ink. */
  primary: 'bg-blue/18 text-blue-deep',
  solid: 'bg-ink text-bg',
} as const;

export type Accent = keyof typeof ACCENT;

export function Card({
  accent = 'none',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { accent?: Accent }) {
  return <div className={cn('rounded-brand', ACCENT[accent], className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-4 pb-0', className)} {...props} />
  );
}

/**
 * Inherits its colour rather than naming one. On a white card that resolves to
 * ink; on a coloured card it is the `-deep` token the card already set on the
 * wrapper. Naming a colour here is exactly what produces pure black type on a
 * yellow block, which §2.5 forbids.
 */
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-display text-base font-medium tracking-tight', className)} {...props} />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
