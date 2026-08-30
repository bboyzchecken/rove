import Image from 'next/image';

import { Flower } from '@/components/brand/doodle';
import { cn } from '@/lib/utils';

/**
 * §15 Tone of Voice: an empty state invites the next action, it does not
 * report emptiness. So the illustration is inviting and the CTA is the point.
 *
 * ROVE_BRAND_SPEC §4.2 gives the flower to empty states, and it sits beside
 * the illustration rather than on it — one mark, well inside §4.3's limit.
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
    <div className={cn('relative flex flex-col items-center px-6 py-10 text-center', className)}>
      <div className="relative mb-3">
        <Image src={image} alt="" width={180} height={180} className="size-40 object-contain" />
        <Flower className="text-ink absolute -top-1 -right-2 size-9" />
      </div>
      <p className="t-h3 text-ink">{title}</p>
      {hint ? <p className="text-muted mt-1 max-w-xs text-sm leading-relaxed">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
