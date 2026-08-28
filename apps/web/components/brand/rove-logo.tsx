import { cn } from '@/lib/utils';

import { RoveMark } from './rove-mark';

/**
 * The wordmark: `rove` set lowercase with the period in blue
 * (ROVE_BRAND_SPEC §5 Nav).
 *
 * It used to be `R✳VE` — capitals with the compass mark standing in for the
 * O. That belonged to a brand whose personality lived in the logo. This one's
 * lives in the doodle linework (§4), so the wordmark's job is to get quiet and
 * stay out of the way: lowercase, one weight, tight tracking, and a single
 * blue period doing the only colouring.
 *
 * Still type rather than an image, so it stays sharp at every size and takes
 * the theme: `light` on cream, `dark` on an ink block, `mono` for print and
 * stamps where the blue would not survive.
 */
const SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
} as const;

/* `dark` uses `text-bg` rather than `text-cream` so it survives the admin
 * surface, where ink and the page trade places and only that pair is
 * redeclared.
 *
 * `canvas` is the hero: §7 Nav puts a white wordmark on the blue canvas and
 * turns the period yellow, because cobalt-on-cobalt would erase it. */
const TONES = {
  light: { body: 'text-ink', dot: 'text-blue' },
  dark: { body: 'text-bg', dot: 'text-blue' },
  canvas: { body: 'text-white', dot: 'text-yellow' },
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
 * The compass mark survives the rebrand here and only here. A wordmark does
 * not reduce to 16px, and a doodle at that size closes up into a blot: §4.1
 * puts the stroke floor at 2.5px, which on a favicon is a sixth of the whole
 * tile. So the geometry stays for the one job it is still the best answer to.
 */
export function RoveIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn('bg-bg inline-flex items-center justify-center rounded-full', className)}
      aria-hidden="true"
    >
      <RoveMark className="text-blue size-[58%]" />
    </span>
  );
}
