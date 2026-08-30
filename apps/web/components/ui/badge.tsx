import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Chips and tags (ROVE_BRAND_SPEC v3 §6 Chips / tags).
 *
 * Pills, never square. `border-radius: 999px`, 11–12px, black text, and §6's
 * one structural rule: LIGHT FILL FOR PASSIVE, SOLID FILL FOR ACTIVE. That is
 * the whole state model — a chip does not change its text colour or grow a
 * border when it is selected, it swaps which half of the feature pair it is
 * wearing. §2.3 in miniature: the light one is calm, the solid one is loud,
 * and a chip is small enough that a solid fill is exactly the "under 48px"
 * the spec reserves it for.
 *
 * EVERY TONE HERE CARRIES BLACK TEXT, INCLUDING THE SOLID ONES.
 * v2 gave each hue a matching `-deep` type colour so a yellow tag and a pink
 * tag read as one family, and blue was a special case that had to invert to
 * white because neither option cleared 4.5:1 at 10px. §2.4 deletes all of
 * that: all twelve colours were measured, every one passes AAA against black
 * (the worst, solid purple, is 7.0) and every one fails against white (the
 * best, the same purple, is 3.0). So black is the family, and the blue
 * exception is gone with the palette that needed it.
 */
const badge = cva(
  'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap text-ink',
  {
    variants: {
      tone: {
        /** The default: §2.1's gray block. Muted type, because a neutral chip
         *  is metadata rather than a state. */
        neutral: 'bg-surface text-muted',
        /** Passive, in the colour of whatever room it is in (§2.5). */
        feature: 'bg-feature',
        /** Selected / on / current — the same chip, solid half of the pair. */
        active: 'bg-feature-solid',
        /** The loud one. White text here is legal precisely because the fill
         *  is black, which is §2.4's only exception. */
        ink: 'bg-ink text-white',
        outline: 'border-ink/25 border bg-transparent',

        /* §2.6 — a light-orange chip is the product's standard "needs
         * checking" treatment. Inside Documents & Finance, where the screen is
         * already orange, use the solid dot or border-bar instead: a light
         * orange chip on a light orange surface is invisible, which is the
         * collision §2.6 exists to resolve. */
        warning: 'bg-orange-light',

        /* No fill. The palette has no red, and inventing a seventh brand
         * colour for it would read as a feature area — so a destructive chip
         * is stated in the dark state colour with a hairline, at the one
         * moment where being quiet is wrong but being a *room* is worse. */
        danger: 'border-danger/40 text-danger border bg-transparent',

        /* §2.5's exceptions only: the trip dashboard, a legend, marketing. */
        itinerary: 'bg-blue-light',
        wishlist: 'bg-pink-light',
        countdown: 'bg-yellow-light',
        journal: 'bg-green-light',
        documents: 'bg-orange-light',
        memo: 'bg-purple-light',
      },
      size: {
        /** §6's `6px 14px` at the small end — 11px, the label step in §3. */
        sm: 'px-3 py-[3px] text-[11px]',
        md: 'px-3.5 py-[5px] text-[12px]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}
