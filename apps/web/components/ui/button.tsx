import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * ROVE_BRAND_SPEC v3 §6 Buttons. Always fully round, never a rounded rectangle.
 *
 *   primary  black fill, white text — the one main action per screen
 *   soft     #F7F7F7 fill, black text — everything else (§6's "secondary")
 *   outline  transparent with a 1.5px black line — low emphasis (§6's tertiary)
 *   ghost    a control that should not look like one until you reach for it
 *
 * NEVER COLOUR A PRIMARY BUTTON WITH A FEATURE COLOUR (§6, and §8's Don't
 * column). This is the rule that makes the rest of v3 work. Six pastel rooms
 * can only coexist if none of them is also the action colour — so colour is
 * context, black is action, and a button looks identical in Wishlist and in
 * Documents. It is also why `primary` here resolves to ink rather than to a
 * hue: see `--brand-primary` in brand.css.
 *
 * v2's `ink` variant is gone. It existed because `primary` was cobalt and the
 * nav CTA needed something louder; now primary *is* ink and the two would be
 * the same button. Callers using `variant="ink"` want `primary`.
 */
const button = cva(
  'font-display inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /* `hover:bg-ink/85` rather than a darker fill, because there is
         * nothing darker than #000000 to go to. Lifting it toward the white
         * page is the only hover this button can have. */
        primary: 'bg-primary text-primary-fg hover:bg-ink/85',
        soft: 'bg-surface text-ink hover:bg-border',
        outline: 'text-ink border-ink hover:bg-ink/5 border-[1.5px] bg-transparent',
        ghost: 'text-muted hover:bg-ink/5',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        /** §6's `14px 28px` — 44px tall, which is also the touch target. */
        md: 'h-11 px-7 text-sm',
        lg: 'h-13 px-8 text-base',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, size, block, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size, block }), className)} {...props} />;
}

/**
 * Same styling for navigation — the prototype is mostly links, not handlers.
 *
 * `next/link` stopped being generic in its href in Next 16, so the wrapper
 * takes Link's own props: `typedRoutes` still checks the destination, it just
 * does it inside Link rather than through a type parameter here.
 */
export function ButtonLink({
  className,
  variant,
  size,
  block,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof button>) {
  return <Link className={cn(button({ variant, size, block }), className)} {...props} />;
}
