import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Where the group is in "หาวันที่ตรงกัน" (M2.5). Five steps, and the only one
 * that ever needs explaining is the one the group is standing on — so the
 * current step keeps its label and the finished ones collapse to a tick.
 */
const STEPS = ['สร้างทริป', 'ชวนเพื่อน', 'ใส่วันว่าง', 'ล็อควัน', 'เลือกปลายทาง'] as const;

export type DateStep = 1 | 2 | 3 | 4 | 5;

export function DateStepBar({ current }: { current: DateStep }) {
  return (
    <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto">
      {STEPS.map((label, index) => {
        const step = (index + 1) as DateStep;
        const done = step < current;
        const active = step === current;

        return (
          <li key={label} className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 transition',
                active ? 'bg-primary/12' : 'bg-transparent',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[10px] font-medium',
                  done
                    ? 'bg-ink text-bg'
                    : active
                      ? 'bg-primary text-primary-fg'
                      : 'bg-surface text-muted',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : step}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium whitespace-nowrap',
                  active ? 'text-primary' : done ? 'text-muted' : 'text-muted/60',
                )}
              >
                {label}
              </span>
            </span>
            {step < STEPS.length ? <span className="bg-border h-px w-3 shrink-0" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
