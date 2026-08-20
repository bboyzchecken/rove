import { cn } from '@/lib/utils';

import { RoveMark } from './rove-mark';

/**
 * The R✳VE wordmark (DEV_SPEC §15).
 *
 * Built as type + mark rather than a flat image so it stays sharp at every
 * size and inherits the theme: `tone="light"` on cream, `tone="dark"` on
 * espresso, `tone="mono"` for print and stamps.
 */
const SIZES = {
  sm: { text: 'text-lg', mark: 'size-[0.62em]', gap: 'gap-[0.06em]' },
  md: { text: 'text-2xl', mark: 'size-[0.6em]', gap: 'gap-[0.05em]' },
  lg: { text: 'text-4xl', mark: 'size-[0.58em]', gap: 'gap-[0.04em]' },
  xl: { text: 'text-6xl', mark: 'size-[0.56em]', gap: 'gap-[0.03em]' },
} as const;

const TONES = {
  light: { body: 'text-espresso', mark: 'text-primary' },
  dark: { body: 'text-bg', mark: 'text-primary-light' },
  mono: { body: 'text-espresso', mark: 'text-espresso' },
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
  const s = SIZES[size];
  const t = TONES[tone];

  return (
    <span
      className={cn(
        'font-display inline-flex items-center font-extrabold tracking-tight select-none',
        s.text,
        s.gap,
        t.body,
        className,
      )}
      // Screen readers and copy-paste get the plain product name.
      aria-label="ROVE"
      role="img"
    >
      <span aria-hidden="true">R</span>
      <RoveMark className={cn(s.mark, t.mark, 'shrink-0')} />
      <span aria-hidden="true">VE</span>
    </span>
  );
}

/** Square app-icon lockup: the mark alone on a cream disc. */
export function RoveIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn('bg-bg inline-flex items-center justify-center rounded-full', className)}
      aria-hidden="true"
    >
      <RoveMark className="text-primary size-[58%]" />
    </span>
  );
}
