import { type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Cards are the whole layout language of this product (§15): soft radius,
 * warm shadow, no hard borders. `tone` paints the accent-block variant used to
 * colour-code a category.
 */
export type CardTone = 'plain' | 'matcha' | 'sky' | 'sun' | 'joyfull' | 'primary';

const toneClass: Record<CardTone, string> = {
  plain: 'bg-surface',
  matcha: 'bg-matcha/25',
  sky: 'bg-sky/25',
  sun: 'bg-sun/25',
  joyfull: 'bg-joyfull/25',
  primary: 'bg-primary/10',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** Drops the shadow for cards nested inside another card. */
  flat?: boolean;
}

export function Card({ tone = 'plain', flat, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-brand-lg p-4',
        toneClass[tone],
        !flat && tone === 'plain' && 'shadow-brand',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-base font-bold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
