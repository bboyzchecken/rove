'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { useVariant } from '@/components/uat/variant-provider';
import { useTripOverview } from '@/features/trip/queries';
import type { TripOverview } from '@/lib/data';
import {
  PHASES,
  STATUS_LABEL,
  STEP_BY_KEY,
  TAB_STEP,
  orderedSteps,
  progressSummary,
  stepStatus,
  type StepStatus,
} from '@/lib/trip-progress';
import { cn } from '@/lib/utils';

/**
 * Trip room tabs (DEV_SPEC §3.2) — three shapes for UAT round 2 to pick from
 * (Feedback #2 — D-11, F3.3, switcher key `trip-tabs`).
 *
 * The complaint (หน้า 17, 11:51–13:32): eleven tabs, all the same, none of
 * them saying whether it still needed the group. So every shape below reads
 * the same four-state status per step (lib/trip-progress) and orders the
 * steps by what the group started with (D-9):
 *
 *   A  the eleven tabs, each with a status dot, reordered, plus a
 *      "ขั้นต่อไป →" button that jumps to the first todo
 *   B  four phases — วางแผน / จอง+เตรียม / ระหว่างทริป / ภาพรวม — the
 *      current phase open, the others folded to a heading with a count
 *   C  no tab strip at all: the overview IS the step list, and a step page
 *      shows one "← ภาพรวม" link at the top instead
 *
 * The order the tester promised to send (fix-list §8) will replace A's order
 * when it arrives; B and C group rather than order, so they keep.
 */

/** The eleven, in the canonical order; `key` is also the i18n key. */
const TABS = [
  { segment: '', key: 'overview' },
  { segment: 'dates', key: 'dates' },
  { segment: 'wishlist', key: 'wishlist' },
  { segment: 'plan', key: 'plan' },
  { segment: 'budget', key: 'budget' },
  { segment: 'expense', key: 'expense' },
  { segment: 'prep', key: 'prep' },
  { segment: 'bookings', key: 'bookings' },
  { segment: 'photos', key: 'photos' },
  { segment: 'documents', key: 'documents' },
  { segment: 'discussion', key: 'discussion' },
] as const;

type Tab = (typeof TABS)[number];

/** The dot each status wears. Solid halves (§2.3 — small and loud), no text. */
const DOT: Record<StepStatus, string> = {
  todo: 'bg-orange-solid',
  check: 'bg-yellow-solid',
  done: 'bg-green-solid',
  skipped: 'bg-border',
};

/** Which phase a tab belongs to for variant B. Discussion rides along the trip. */
const TAB_PHASE: Record<string, (typeof PHASES)[number]['key'] | 'overview'> = {
  '': 'overview',
  dates: 'plan',
  wishlist: 'plan',
  plan: 'plan',
  bookings: 'book',
  budget: 'book',
  prep: 'book',
  documents: 'book',
  expense: 'during',
  photos: 'during',
  discussion: 'during',
};

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const t = useTranslations();
  const variant = useVariant('trip-tabs');
  const { data: overview } = useTripOverview(tripId);
  const base = `/t/${tripId}`;

  const hrefOf = (tab: Tab) => (tab.segment ? `${base}/${tab.segment}` : base);
  const activeSegment = pathname === base ? '' : (pathname.split('/')[3] ?? '');

  const statusOf = (tab: Tab): StepStatus | null => {
    const step = TAB_STEP[tab.segment];
    return step && overview ? stepStatus(overview, step) : null;
  };

  // A and B both put the steps in the trip's own order (D-9).
  const ordered = orderTabs(overview);

  /* ------------------------------------------------------------- C ---- */
  if (variant === 'c') {
    if (activeSegment === '') return null;
    const tab = TABS.find((entry) => entry.segment === activeSegment);
    const status = tab ? statusOf(tab) : null;
    return (
      <nav className="bg-bg/90 sticky top-14 z-20 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link
            href={base as never}
            className="text-ink hover:bg-surface inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 text-sm font-medium"
          >
            <ArrowLeft className="size-4" /> ภาพรวม
          </Link>
          {tab ? (
            <span className="font-display text-ink flex items-center gap-2 text-sm font-medium">
              {t(`trip.${tab.key}`)}
              {status ? <StatusChip status={status} /> : null}
            </span>
          ) : null}
        </div>
      </nav>
    );
  }

  /* ------------------------------------------------------------- B ---- */
  if (variant === 'b') {
    const currentPhase = TAB_PHASE[activeSegment] ?? 'overview';
    return (
      <nav className="bg-bg/90 sticky top-14 z-20 backdrop-blur-md">
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 pt-2.5 pb-1.5">
          <Link
            href={base as never}
            className={cn(
              'font-display rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
              currentPhase === 'overview' ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-border',
            )}
          >
            {t('trip.overview')}
          </Link>
          {PHASES.map((phase) => {
            const tabs = ordered.filter((tab) => TAB_PHASE[tab.segment] === phase.key);
            const statuses = tabs.map(statusOf).filter((s): s is StepStatus => s !== null);
            const remaining = statuses.filter((s) => s === 'todo' || s === 'check').length;
            const open = currentPhase === phase.key;
            const first = tabs[0];
            return (
              <Link
                key={phase.key}
                href={(first ? hrefOf(first) : base) as never}
                className={cn(
                  'font-display inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
                  open ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-border',
                )}
              >
                {phase.label}
                {remaining > 0 ? (
                  <span
                    className={cn(
                      'nums rounded-full px-1.5 text-[10px] leading-4',
                      open ? 'bg-bg/20 text-bg' : 'bg-orange-solid text-ink',
                    )}
                  >
                    {remaining}
                  </span>
                ) : statuses.length > 0 ? (
                  <span className={cn('size-1.5 rounded-full', open ? 'bg-bg' : 'bg-green-solid')} />
                ) : null}
              </Link>
            );
          })}
        </div>
        {currentPhase !== 'overview' ? (
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-4 pb-2">
            {ordered
              .filter((tab) => TAB_PHASE[tab.segment] === currentPhase)
              .map((tab) => (
                <TabLink
                  key={tab.key}
                  href={hrefOf(tab)}
                  active={activeSegment === tab.segment}
                  label={t(`trip.${tab.key}`)}
                  status={statusOf(tab)}
                  small
                />
              ))}
          </div>
        ) : null}
      </nav>
    );
  }

  /* ------------------------------------------------------------- A ---- */
  const next = overview ? progressSummary(overview).next : undefined;
  const nextTab = next ? TABS.find((tab) => tab.segment === STEP_BY_KEY[next.key].segment) : undefined;

  return (
    <nav className="bg-bg/90 sticky top-14 z-20 backdrop-blur-md">
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 py-2.5">
        {ordered.map((tab) => (
          <TabLink
            key={tab.key}
            href={hrefOf(tab)}
            active={activeSegment === tab.segment}
            label={t(`trip.${tab.key}`)}
            status={statusOf(tab)}
          />
        ))}
      </div>
      {next && nextTab && activeSegment === '' ? (
        <div className="px-4 pb-2.5">
          <Link
            href={hrefOf(nextTab) as never}
            className="bg-orange-light text-ink inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
          >
            {t('status.next')}: {STEP_BY_KEY[next.key].label} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </nav>
  );
}

/**
 * Overview first, then the step tabs in the trip's order, then the tabs that
 * carry no step (discussion). Steps that share a tab (route + bookings) count
 * once.
 */
function orderTabs(overview: TripOverview | undefined): Tab[] {
  if (!overview) return [...TABS];
  const bySegment = new Map<string, Tab>(TABS.map((tab) => [tab.segment, tab]));
  const out: Tab[] = [bySegment.get('')!];
  const seen = new Set<string>(['']);
  for (const step of orderedSteps(overview.trip.startedWith)) {
    const tab = bySegment.get(step.segment);
    if (tab && !seen.has(tab.segment)) {
      seen.add(tab.segment);
      out.push(tab);
    }
  }
  for (const tab of TABS) {
    if (!seen.has(tab.segment)) out.push(tab);
  }
  return out;
}

function TabLink({
  href,
  active,
  label,
  status,
  small = false,
}: {
  href: string;
  active: boolean;
  label: string;
  status: StepStatus | null;
  small?: boolean;
}) {
  return (
    <Link
      href={href as never}
      title={status ? STATUS_LABEL[status] : undefined}
      className={cn(
        'font-display inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition',
        small ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        active ? 'bg-ink text-bg' : 'text-muted hover:bg-surface',
      )}
    >
      {status ? (
        <span
          aria-label={STATUS_LABEL[status]}
          className={cn('size-2 shrink-0 rounded-full', DOT[status], active && 'ring-bg/40 ring-2')}
        />
      ) : null}
      {label}
    </Link>
  );
}

export function StatusChip({ status, className }: { status: StepStatus; className?: string }) {
  const t = useTranslations('status');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        status === 'todo' && 'bg-orange-light text-ink',
        status === 'check' && 'bg-yellow-light text-ink',
        status === 'done' && 'bg-green-light text-ink',
        status === 'skipped' && 'bg-surface text-muted',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT[status])} />
      {t(status)}
    </span>
  );
}
