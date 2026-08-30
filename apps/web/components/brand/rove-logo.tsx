import { cn } from '@/lib/utils';

import { RoveMark } from './rove-mark';

/**
 * The wordmark: `rove` set lowercase, with the period in the CURRENT SECTION'S
 * solid accent colour (ROVE_BRAND_SPEC v3 §6 Nav).
 *
 * It used to be `R✳VE` — capitals with the compass mark standing in for the
 * O. That belonged to a brand whose personality lived in the logo. This one's
 * lives in the doodle linework (§5), so the wordmark's job is to get quiet and
 * stay out of the way: lowercase, one weight, tight tracking, and a single
 * coloured period doing all of the colouring.
 *
 * THE PERIOD IS THE SMALLEST INSTANCE OF THE WHOLE v3 IDEA.
 * §6 asks for it to take the section's accent, so it re-colours as you move
 * between rooms — pink in Wishlist, orange in Documents — while the four
 * letters beside it never move. It is the same colour-tells-you-where-you-are
 * mapping as a section banner, at 4px, on a mark the user sees on every single
 * screen. `text-feature-solid` gets that for free from `data-feature`; the dot
 * needs no prop and cannot fall out of sync with the page.
 *
 * On a neutral screen `--feature-solid` resolves to ink, so the period simply
 * disappears into the wordmark. That is the correct look for a screen with no
 * feature rather than a fallback worth designing around.
 *
 * Still type rather than an image, so it stays sharp at every size and takes
 * the theme: `light` on the white page, `dark` on an ink block, `mono` for
 * print and stamps where the accent would not survive.
 */
const SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
} as const;

/* `dark` uses `text-bg` rather than `text-white` so it survives the admin
 * surface, where ink and the page trade places and only that pair is
 * redeclared.
 *
 * v2's `canvas` tone is gone with the canvas itself — v3 has no full-bleed
 * coloured hero for a white wordmark to sit on. Every surface the logo appears
 * on now is white, gray, or ink. */
const TONES = {
  light: { body: 'text-ink', dot: 'text-feature-solid' },
  dark: { body: 'text-bg', dot: 'text-feature-solid' },
  mono: { body: 'text-ink', dot: 'text-ink' },
} as const;

export function RoveLogo({
  size = 'md',
  tone = 'light',
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const t = TONES[tone];

  return (
    <span
      className={cn(
        'font-display inline-block leading-none font-medium tracking-[-0.03em] lowercase select-none',
        SIZES[size],
        t.body,
        className,
      )}
      // Screen readers and copy-paste get the plain product name; the period is
      // a mark, not punctuation, so it is not read out.
      aria-label="rove"
      role="img"
    >
      <span aria-hidden="true">rove</span>
      <span aria-hidden="true" className={t.dot}>
        .
      </span>
    </span>
  );
}

/**
 * Square app-icon lockup — favicon, PWA tile, the avatar in a share card.
 *
 * The compass mark survives the rebrand here and only here, and in ink rather
 * than an accent: a favicon has no `data-feature` to read and no room to be
 * in. A wordmark does not reduce to 16px, and a doodle at that size closes up
 * into a blot — §5.1 puts the stroke at 3–4px, which on a favicon is a quarter
 * of the whole tile. So the geometry stays for the one job it is still the
 * best answer to.
 */
export function RoveIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn('bg-bg inline-flex items-center justify-center rounded-full', className)}
      aria-hidden="true"
    >
      <RoveMark className="text-ink size-[58%]" />
    </span>
  );
}
