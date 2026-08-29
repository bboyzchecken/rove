import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * ROVE_BRAND_SPEC §7 Buttons. Always fully round, never a rounded rectangle.
 *
 *   primary  blue fill, white type — the action, per §2.4's colour lock
 *   ink      ink fill, page-colour type — the nav CTA, and nothing else
 *   outline  transparent with a 1.5px ink line, the secondary next to primary
 *   soft     a quiet control inside an already-busy card
 *   ghost    a control that should not look like one until you reach for it
 *
 * WHICH BLUE
 * §7 asks for `--brand-blue` with white text, and §2.2's table rules that
 * exact pair out below 48px: white on #3D86C8 is 3.82 and a button label is
 * 14–16px. The two collide, §2.2 is the one marked critical, so
 * `--brand-primary` resolves to the canvas blue — see brand.css. Blue still
 * means action (§2.4); it is just the legible blue.
 */
const button = cva(
  'font-display inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-blue-mid',
        ink: 'bg-ink text-bg hover:bg-ink/90',
        soft: 'bg-surface border-border text-ink hover:bg-border/50 border',
        outline: 'text-ink border-ink hover:bg-ink/5 border-[1.5px] bg-transparent',
        ghost: 'text-muted hover:bg-ink/5',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        /** §5's 12px/24px. */
        md: 'h-11 px-6 text-sm',
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
