import { cn } from '@/lib/utils';

/**
 * The only card in the app.
 *
 * §15 Visual Direction: the page is white and separation comes from flat
 * colour blocks, not from borders or shadows. `accent` picks which block this
 * is; the accent hue is tinted over white rather than kept as a second set of
 * pastel hexes, so brand.css stays the only place a colour is named.
 */
const ACCENT_TINT = {
  none: 'bg-surface',
  primary: 'bg-primary/12',
  matcha: 'bg-matcha/55',
  sky: 'bg-sky/55',
  sun: 'bg-sun/55',
  joyfull: 'bg-joyfull/55',
  /** Full-strength terracotta — one per screen at most, for the main action. */
  solid: 'bg-primary text-primary-fg',
} as const;

export type Accent = keyof typeof ACCENT_TINT;

export function Card({
  accent = 'none',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { accent?: Accent }) {
  return <div className={cn('rounded-brand', ACCENT_TINT[accent], className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 p-4 pb-0', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-espresso text-base font-bold tracking-tight', className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
