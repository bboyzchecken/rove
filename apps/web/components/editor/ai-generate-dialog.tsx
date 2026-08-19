'use client';

import { useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Button } from '@/components/ui/button';
import { OPEN_QUESTIONS, planStats, WISHLIST } from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * "ให้ AI ร่างแพลน" progress (M4 — W4.1).
 *
 * The real pipeline streams these steps over SSE from `ai_jobs`; here they run
 * on a timer so the demo shows the same shape — including the fact that ROVE
 * explains itself and asks back instead of dumping a finished plan.
 */
const STEPS = [
  `อ่านที่อยากไปของทุกคน ${WISHLIST.length} รายการ`,
  'จัดกลุ่มสถานที่ตามโซน แล้วแบ่งเป็นวัน',
  'เช็คเวลาเปิด-ปิด ระยะทางจริง และพยากรณ์อากาศ',
  'ตรวจว่าแพลนเป็นไปได้จริง แล้วซ่อมจุดที่ชนกัน',
  'เขียนเหตุผลกำกับแต่ละวัน',
];

export function AiGenerateDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const done = step >= STEPS.length;

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setStep((s) => s + 1), step === 0 ? 700 : 1_100);
    return () => clearTimeout(timer);
  }, [step, done]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        className="bg-espresso/40 absolute inset-0 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="ปิด"
      />

      <div className="bg-bg rounded-t-brand-lg sm:rounded-brand-lg animate-rove-rise relative z-10 w-full max-w-lg p-5 pb-8 sm:pb-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <RoveMark className={cn('text-primary size-6', !done && 'animate-rove-spin')} />
            <div>
              <p className="font-display text-espresso font-bold">
                {done ? 'ร่างแพลนเสร็จแล้ว' : 'กำลังร่างแพลนให้...'}
              </p>
              <p className="text-muted text-xs">
                {done
                  ? `${planStats.days} วัน · ${planStats.items} รายการ · ใช้เวลา 42 วินาที`
                  : 'ปกติใช้เวลาไม่เกิน 1 นาที'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted p-1" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'todo';
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    state === 'done' && 'bg-matcha text-espresso',
                    state === 'active' && 'bg-primary text-primary-fg',
                    state === 'todo' && 'bg-surface text-muted',
                  )}
                >
                  {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    state === 'todo' ? 'text-muted/60' : 'text-espresso font-medium',
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {done ? (
          <div className="animate-rove-rise mt-5">
            <p className="section-label mb-2">ROVE ขอถามกลับ {OPEN_QUESTIONS.length} ข้อ</p>
            <ul className="space-y-2">
              {OPEN_QUESTIONS.map((q) => (
                <li key={q} className="bg-surface rounded-2xl p-3">
                  <p className="text-espresso text-xs leading-relaxed">{q}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" variant="soft" className="h-7 px-3 text-[11px]">
                      ตอบ
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-3 text-[11px]">
                      ข้ามไปก่อน
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <Button block size="lg" className="mt-4" onClick={onClose}>
              <Sparkles className="size-4" /> ดูแพลนที่ร่างให้
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
