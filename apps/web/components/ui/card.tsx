import { cn } from '@/lib/utils';

/**
 * The only card in the app (ROVE_BRAND_SPEC v3 §6 Feature cards).
 *
 * Flat fill, 22px corners, black text, NO SHADOW — §4 calls the no-shadow rule
 * the single most important one for keeping this style crisp, because one drop
 * shadow turns soft neubrutalism into generic SaaS. Separation on the page
 * comes from colour and spacing.
 *
 * WHY `feature` IS THE DEFAULT COLOURED CARD AND THE HUES ARE NOT
 * v2 had four cards named by hue (`accent="yellow"`), tinted to ~20% so a grid
 * of them would not blow the page's colour budget. v3 removes both halves of
 * that:
 *
 *   - The fills are full strength now. §2.3 caps the SOLID accents at small
 *     elements, but the LIGHT colours are specified for exactly this — "card
 *     fills, section backgrounds, banners". They are pastels; six of them on a
 *     white page is the design, not an overrun.
 *   - The hue is no longer the caller's choice. §2.5 gives each screen one
 *     feature colour, so a card takes the colour of the room it is standing
 *     in: `accent="feature"` resolves through `data-feature` on an ancestor.
 *     A card literally cannot be pink on the budget screen, because no card
 *     names pink.
 *
 * The named-hue cards that remain exist only for §2.5's three exceptions — the
 * trip dashboard where each feature is its own entry card, a legend, and the
 * marketing page. Using one anywhere else is the mapping bug §2.5 describes.
 */
const ACCENT = {
  /** White with a hairline. The default, and still what most cards should be:
   *  §1's whole direction is a white page with pastel rooms in it, not a page
   *  made of pastel. */
  none: 'bg-bg border-border border',
  /** The quiet block — §2.1's "subtle blocks" gray. No border; at #F7F7F7 on
   *  white the fill is the edge. */
  gray: 'bg-surface',
  /** The room's own colour. This is the one to reach for. */
  feature: 'bg-feature',
  /** Full-strength ink — at most one per screen, for the moment that matters.
   *  `text-bg` and not `text-white`: on the admin surface ink and the page
   *  swap places, and only that pair stays legible in both scopes. */
  ink: 'bg-ink text-bg',

  /**
   * §2.6 — "needs checking". The one card that names a hue on purpose and is
   * still allowed on any screen.
   *
   * That is a deliberate reading of the spec, not a hole in §2.5. Orange does
   * double duty in v3: it is the Documents & Finance identity AND the
   * product's warning signal, and §2.6 settles the collision by keeping the
   * light-orange banner as "the standard warning treatment" everywhere
   * *except* inside Documents itself — where an orange banner on an orange
   * screen is invisible, and the warning becomes solid orange at small scale
   * instead (a filled dot, a left border bar).
   *
   * So on a blue Itinerary screen this is a legitimate second colour: it is
   * not a feature identity intruding, it is the signal that outranks the room.
   * Inside Documents, reach for `gray` plus `border-feature-solid border-l-4`.
   */
  warning: 'bg-orange-light',

  /* §2.5's exceptions only — a dashboard of feature entry cards, or a legend. */
  itinerary: 'bg-blue-light',
  wishlist: 'bg-pink-light',
  countdown: 'bg-yellow-light',
  journal: 'bg-green-light',
  documents: 'bg-orange-light',
  memo: 'bg-purple-light',
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
    <div className={cn('flex items-start justify-between gap-3 p-5 pb-0', className)} {...props} />
  );
}

/**
 * Inherits its colour rather than naming one — which under v3 resolves to
 * black on every card, because §2.4 puts black text on all twelve colours and
 * white text only on black. The `ink` card is the single exception and it sets
 * `text-bg` on the wrapper for exactly that reason.
 *
 * v2 needed a per-hue `-deep` token here so a yellow card and a blue card read
 * as one family. v3 does not: measured, every light colour is 13:1 or better
 * against black, so black IS the family.
 */
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-display text-base font-medium tracking-tight', className)} {...props} />
  );
}

/** §6's `20–24px` of internal padding — generous is part of the spec here. */
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

/**
 * The solid-accent circle a feature card wears at one corner (§6): 36–44px,
 * holding a BLACK icon or checkmark.
 *
 * Black and not white, and that is not a style choice — §2.4 measured all six
 * solid accents and every one of them fails against white (the best, purple,
 * is 3.00) while every one passes against black at 7:1 or better. A white
 * checkmark on #B377FF is the exact mistake §8's Don't column names.
 *
 * It is a component rather than a documented pattern because that measurement
 * is the kind of thing that gets re-litigated per card otherwise.
 */
export function CardMark({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-feature-solid text-ink grid size-10 shrink-0 place-items-center rounded-full',
        className,
      )}
      {...props}
    />
  );
}
