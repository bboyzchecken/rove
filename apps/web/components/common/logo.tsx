import Link from 'next/link';

import { route } from '@/lib/routes';

import { env } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * The wordmark. Rendered inline rather than as an <img> so it inherits the
 * current colour and stays crisp at any size — and so the eight-petal asterisk
 * can animate on hover without a second asset.
 */
export function Logo({
  className,
  href = '/',
  size = 'md',
}: {
  className?: string;
  href?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const heights = { sm: 'h-6', md: 'h-8', lg: 'h-11' };

  const mark = (
    <span className={cn('inline-flex items-center', heights[size], className)}>
      <svg viewBox="0 0 200 56" className="h-full w-auto" role="img" aria-label={env.brandName}>
        <g
          fill="currentColor"
          fontFamily="var(--font-display)"
          fontWeight="700"
          fontSize="44"
          letterSpacing="1"
        >
          <text x="0" y="42">
            R
          </text>
          <text x="86" y="42">
            VE
          </text>
        </g>
        <g transform="translate(59 26)" className="fill-primary">
          <g>
            <rect x="-3.2" y="-21" width="6.4" height="18" rx="3.2" />
            <rect x="-3.2" y="3" width="6.4" height="18" rx="3.2" />
            <rect x="-21" y="-3.2" width="18" height="6.4" rx="3.2" />
            <rect x="3" y="-3.2" width="18" height="6.4" rx="3.2" />
          </g>
          <g transform="rotate(45)">
            <rect x="-2.6" y="-19" width="5.2" height="16" rx="2.6" />
            <rect x="-2.6" y="3" width="5.2" height="16" rx="2.6" />
            <rect x="-19" y="-2.6" width="16" height="5.2" rx="2.6" />
            <rect x="3" y="-2.6" width="16" height="5.2" rx="2.6" />
          </g>
          <circle cx="0" cy="0" r="4.2" fill="currentColor" />
        </g>
      </svg>
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={route(href)} className="text-espresso" aria-label={env.brandName}>
      {mark}
    </Link>
  );
}
