import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * §15 Tone of Voice: an empty state invites the next action, it does not
 * report emptiness. So the illustration is warm and the CTA is the point.
 */
export function EmptyState({
  image,
  title,
  hint,
  action,
  className,
}: {
  image: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <Image src={image} alt="" width={180} height={180} className="mb-3 size-40 object-contain" />
      <p className="font-display text-espresso text-base font-bold">{title}</p>
      {hint ? <p className="text-muted mt-1 max-w-xs text-sm leading-relaxed">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
