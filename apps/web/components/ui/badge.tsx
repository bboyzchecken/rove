import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/** Small rounded chips — §15 wants pills, never square tags. */
const badge = cva('inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface text-muted',
      primary: 'bg-primary/12 text-primary',
      matcha: 'bg-matcha/55 text-espresso',
      sky: 'bg-sky/55 text-espresso',
      sun: 'bg-sun/55 text-espresso',
      joyfull: 'bg-joyfull/55 text-espresso',
      solid: 'bg-primary text-primary-fg',
      outline: 'border-border text-muted border bg-transparent',
      warning: 'bg-warning/12 text-warning',
      danger: 'bg-danger/12 text-danger',
    },
    size: {
      sm: 'px-2 py-0.5 text-[11px]',
      md: 'px-2.5 py-1 text-xs',
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
