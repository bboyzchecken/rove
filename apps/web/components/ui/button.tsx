import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const button = cva(
  'font-display inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary/90',
        espresso: 'bg-espresso text-bg hover:bg-espresso/90',
        soft: 'bg-surface text-espresso hover:bg-border',
        outline: 'border-border text-espresso hover:bg-surface border bg-transparent',
        ghost: 'text-muted hover:bg-surface',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-13 px-7 text-base',
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
 * Generic in the href so `typedRoutes` can still check the destination through
 * the wrapper.
 */
export function ButtonLink<T extends string>({
  className,
  variant,
  size,
  block,
  ...props
}: React.ComponentProps<typeof Link<T>> & VariantProps<typeof button>) {
  return <Link className={cn(button({ variant, size, block }), className)} {...props} />;
}
