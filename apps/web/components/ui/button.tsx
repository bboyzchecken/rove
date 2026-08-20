import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * The one button. Variants are the brand's, not a generic set: `primary` is
 * terracotta, `soft` is the accent-block style §15 asks for instead of borders.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 font-medium transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    // Touch targets stay >=40px: this is used one-handed on a phone.
    'select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-light shadow-brand',
        secondary: 'bg-espresso text-white hover:opacity-90',
        soft: 'bg-primary/10 text-primary hover:bg-primary/20',
        outline: 'border border-border bg-surface text-espresso hover:bg-primary/5',
        ghost: 'text-muted hover:bg-espresso/5 hover:text-espresso',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        sm: 'h-9 rounded-xl px-3 text-sm',
        md: 'h-11 rounded-brand px-4 text-sm',
        lg: 'h-13 rounded-brand px-6 text-base',
        icon: 'h-10 w-10 rounded-full',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Renders a spinner and blocks input while a mutation is in flight. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(button({ variant, size, full }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}
