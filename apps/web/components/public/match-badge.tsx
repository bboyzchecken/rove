import { Sparkles } from 'lucide-react';

import type { MatchResult } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * How well a published plan fits the trip you are already planning (A11.3).
 *
 * The reasons are shown, not hidden behind a tooltip: a percentage on its own
 * is a number nobody trusts, and the whole point of the score is that it can
 * say why. Three lines at most — that is all the API sends.
 */
export function MatchBadge({
  match,
  className,
  compact = false,
}: {
  match: MatchResult;
  className?: string;
  compact?: boolean;
}) {
  // A three-step scale, so it uses the two halves of the room's pair and then
  // falls back to gray — §2.3's solid for the score worth acting on, the light
  // fill for a decent one, neutral for the rest. Black type throughout (§2.4).
  const tone =
    match.score >= 80
      ? 'bg-feature-solid text-ink'
      : match.score >= 60
        ? 'bg-feature text-ink'
        : 'bg-surface text-muted';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
          tone,
        )}
      >
        <Sparkles className="size-3" />
        เข้ากับทริปคุณ {match.score}%
      </span>
      {!compact && match.reasons.length > 0 ? (
        <ul className="text-muted space-y-0.5 text-[11px]">
          {match.reasons.slice(0, 2).map((reason) => (
            <li key={reason} className="line-clamp-1">
              · {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
