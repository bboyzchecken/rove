'use client';

import Link from 'next/link';
import { ArrowRight, Check, Eye, RotateCcw } from 'lucide-react';

import { StatusChip } from '@/components/trip/trip-tabs';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useSetStepStatus } from '@/features/trip/queries';
import type { TripOverview } from '@/lib/data';
import { orderedSteps, progressSummary, stepStatus, type StepInfo } from '@/lib/trip-progress';
import { cn } from '@/lib/utils';

/**
 * "เตรียมห้องทริปให้พร้อม" (Feedback #2 — D-12, F3.4, หน้า 17, 12:01–13:32).
 *
 * The old list ticked itself and could not be argued with: a trip with no
 * bookings to make sat at 4/5 forever. Now every step is one of four things
 * (lib/trip-progress) and the row says what to DO about it:
 *
 *   done     a green tick, and the row is not a control
 *   todo     the row IS the button — solid, with an arrow — into the tab
 *   check    a quieter "ตรวจดู" button, because something is there already
 *   skipped  greyed, with a small "เอากลับ"
 *
 * Any todo / check row has a small "ข้าม" (D-12): the group decides what this
 * trip does not need, and the percentage above counts only what it does.
 *
 * `onInvite` is the one step that opens a dialog rather than a tab.
 */
export function TripChecklist({
  tripId,
  overview,
  onInvite,
  asPage = false,
  className,
}: {
  tripId: string;
  overview: TripOverview;
  onInvite: () => void;
  /** Variant C: the list IS the overview, so it gets more room and no card. */
  asPage?: boolean;
  className?: string;
}) {
  const setStep = useSetStepStatus(tripId);
  const steps = orderedSteps(overview.trip.startedWith);
  // Feedback #4 — F9: "during"-phase steps (expense, photos) cannot be done
  // before the trip starts, so they get their own ungated group instead of
  // holding the pre-travel percentage hostage (see progressSummary).
  const preTravelSteps = steps.filter((step) => step.phase !== 'during');
  const duringSteps = steps.filter((step) => step.phase === 'during');
  const summary = progressSummary(overview, steps);

  const Wrapper = asPage ? 'div' : Card;

  function rowFor(step: StepInfo) {
    const status = stepStatus(overview, step.key);
    return (
      <StepRow
        key={step.key}
        tripId={tripId}
        step={step}
        status={status}
        asPage={asPage}
        onInvite={onInvite}
        onSkip={() => setStep.mutate({ step: step.key, status: 'skipped' })}
        onRestore={() => setStep.mutate({ step: step.key, status: 'todo' })}
        onConfirm={() => setStep.mutate({ step: step.key, status: 'confirmed' })}
      />
    );
  }

  return (
    <Wrapper
      {...(asPage ? {} : { accent: 'feature' as const })}
      className={cn(asPage ? '' : 'p-4', className)}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-ink font-medium">
          {asPage ? 'ขั้นตอนของทริปนี้' : 'เตรียมห้องทริปให้พร้อม'}
        </p>
        <p className="text-ink nums text-sm font-medium">
          พร้อม {summary.percent}%
          <span className="text-muted ml-1.5 font-normal">
            {summary.remaining > 0 ? `· เหลืออีก ${summary.remaining} อย่าง` : '· ครบแล้ว'}
          </span>
        </p>
      </div>
      <Progress value={summary.percent / 100} tone="ink" />

      <ul className={cn('mt-3', asPage ? 'space-y-2' : 'space-y-1.5')}>
        {preTravelSteps.map(rowFor)}
      </ul>

      {duringSteps.length > 0 ? (
        <>
          <p className="text-muted mt-4 mb-1.5 text-[11px] font-medium">
            ระหว่างทริป — ไม่รวมในเปอร์เซ็นต์
          </p>
          <ul className={cn(asPage ? 'space-y-2' : 'space-y-1.5')}>{duringSteps.map(rowFor)}</ul>
        </>
      ) : null}
    </Wrapper>
  );
}

function StepRow({
  tripId,
  step,
  status,
  asPage,
  onInvite,
  onSkip,
  onRestore,
  onConfirm,
}: {
  tripId: string;
  step: StepInfo;
  status: ReturnType<typeof stepStatus>;
  asPage: boolean;
  onInvite: () => void;
  onSkip: () => void;
  onRestore: () => void;
  onConfirm: () => void;
}) {
  const href = `/t/${tripId}${step.segment ? `/${step.segment}` : ''}`;
  const isInvite = step.key === 'invite';

  const action =
    status === 'todo' ? (
      isInvite ? (
        <button
          type="button"
          onClick={onInvite}
          className="bg-ink text-bg inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
        >
          {step.action} <ArrowRight className="size-3.5" />
        </button>
      ) : (
        <Link
          href={href as never}
          className="bg-ink text-bg inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
        >
          {step.action} <ArrowRight className="size-3.5" />
        </Link>
      )
    ) : status === 'check' ? (
      <Link
        href={(isInvite ? `/t/${tripId}` : href) as never}
        onClick={isInvite ? onInvite : undefined}
        className="border-ink text-ink inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-xs font-medium"
      >
        <Eye className="size-3.5" /> ตรวจดู
      </Link>
    ) : status === 'skipped' ? (
      <button
        type="button"
        onClick={onRestore}
        className="text-muted hover:text-ink inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium"
      >
        <RotateCcw className="size-3" /> เอากลับ
      </button>
    ) : null;

  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-2xl',
        asPage ? 'bg-bg border-border border p-3' : 'px-1 py-1',
        status === 'skipped' && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full',
          status === 'done' && 'bg-green-solid text-ink',
          status === 'check' && 'bg-yellow-solid text-ink',
          status === 'todo' && 'border-ink/30 border-2 border-dashed',
          status === 'skipped' && 'bg-surface text-muted',
        )}
      >
        {status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : null}
        {status === 'check' ? <Eye className="size-3" strokeWidth={2.5} /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm',
            status === 'done' ? 'text-muted' : 'text-ink font-medium',
            status === 'skipped' && 'line-through',
          )}
        >
          {step.label}
        </p>
        {asPage ? (
          <div className="mt-0.5">
            <StatusChip status={status} />
          </div>
        ) : null}
        {/* Feedback #4 — D-26: a check step with no other way to reach 100%
            (dates typed in but never locked, a plan that leaves a wish
            uncovered on purpose) gets a manual "close this out" escape hatch,
            quiet enough not to compete with the main ตรวจดู action. */}
        {status === 'check' && !step.skippable ? (
          <button
            type="button"
            onClick={onConfirm}
            className="text-muted hover:text-ink mt-0.5 block text-[11px] underline-offset-2 hover:underline"
          >
            เรียบร้อยแล้ว — ไม่ต้องตรวจอีก
          </button>
        ) : null}
      </div>

      {action}

      {/* Feedback #3 — D-4: every row with a button keeps the "ข้าม" slot, so
          the black pills end on one line whether or not the step can be
          skipped. */}
      {action ? (
        (status === 'todo' || status === 'check') && step.skippable ? (
          <button
            type="button"
            onClick={onSkip}
            title="ทริปนี้ไม่ต้องทำขั้นนี้"
            className="text-muted hover:text-ink w-9 shrink-0 rounded-full py-1 text-center text-[11px]"
          >
            ข้าม
          </button>
        ) : (
          <span aria-hidden className="w-9 shrink-0" />
        )
      ) : null}
    </li>
  );
}
