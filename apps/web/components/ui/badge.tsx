import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Pills, never square tags (ROVE_BRAND_SPEC §5 Tags/pills).
 *
 * This is where the palette gets to run at full strength: a pill is small
 * enough that a saturated block of it costs almost nothing against §2.3's
 * ratio, which is why the cards are tinted and these are not.
 *
 * Every coloured tone takes its own `-deep` token, never ink and never white
 * — §2.5, and the reason a yellow pill and a pink pill still read as the same
 * family rather than as two stickers.
 */
const badge = cva('inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface border-border text-muted border',
      yellow: 'bg-yellow text-yellow-deep',
      green: 'bg-green text-green-deep',
      pink: 'bg-pink text-pink-deep',
      /* Blue is the one tag that cannot follow the `-deep` pattern. At tag
       * size everything here is 10–12px, which needs 4.5:1, and on
       * `--brand-blue` neither option reaches it: `--blue-deep` is 3.72 and
       * white is 3.86 (§2.2's own table calls white on that blue "large
       * display type only"). So a blue tag uses the canvas blue instead,
       * where white lands at 5.47 and passes. Same colour meaning, one step
       * darker, legible at 10px. */
      blue: 'bg-canvas text-white',
      /** The API still sends these two; §2.4 puts action on blue, loud on ink. */
      primary: 'bg-canvas text-white',
      solid: 'bg-ink text-bg',
      outline: 'border-border text-muted border bg-transparent',
      warning: 'bg-yellow text-yellow-deep',
      danger: 'bg-danger/15 text-danger',
    },
    size: {
      /** §3's tag step: 10–11px, and the only place letterspacing is allowed. */
      sm: 'px-3 py-[3px] text-[10px] tracking-[0.04em]',
      md: 'px-3 py-[5px] text-[11px] tracking-[0.04em]',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}
