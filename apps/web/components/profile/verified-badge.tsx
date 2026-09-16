import { BadgeCheck } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * "ยืนยันตัวตนแล้ว" (Feedback #4 — D-37).
 *
 * The chip where there is room; `compact` is the check alone, labelled for
 * screen readers and on hover, for a creator name on a card.
 */
export function VerifiedBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <span title="ยืนยันตัวตนแล้ว" className={cn('inline-flex shrink-0', className)}>
        <BadgeCheck
          aria-label="ยืนยันตัวตนแล้ว"
          className="fill-green-solid text-ink size-3.5"
          strokeWidth={2.2}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'bg-green-light text-ink inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap',
        className,
      )}
    >
      <BadgeCheck className="fill-green-solid size-3.5" strokeWidth={2.2} />
      ยืนยันตัวตนแล้ว
    </span>
  );
}
