'use client';

import { useEffect, useState } from 'react';
import { Check, Gift, Sparkles, UserPlus, Wallet, X } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AI_CREDITS, OPEN_QUESTIONS, planStats, WISHLIST } from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * "ให้ AI ร่างแพลน" (M4 — W4.1) plus the meter in front of it.
 *
 * Two drafts per trip are free; the third onwards is unlocked with points or a
 * purchase (§16). The gate lives inside this dialog rather than on a separate
 * page, because the moment someone wants another draft is the moment to show
 * what a draft costs — and how to earn it back by inviting friends.
 *
 * The pipeline itself streams these steps over SSE from `ai_jobs`; here they
 * run on a timer so the demo shows the same shape — including the fact that
 * ROVE explains itself and asks back instead of dumping a finished plan.
 */
const STEPS = [
  `อ่านที่อยากไปของทุกคน ${WISHLIST.length} รายการ`,
  'จัดกลุ่มสถานที่ตามโซน แล้วแบ่งเป็นวัน',
  'เช็คเวลาเปิด-ปิด ระยะทางจริง และพยากรณ์อากาศ',
  'ตรวจว่าแพลนเป็นไปได้จริง แล้วซ่อมจุดที่ชนกัน',
  'เขียนเหตุผลกำกับแต่ละวัน',
];

export function AiGenerateDialog({
  runsUsed,
  points,
  onClose,
  onSpend,
}: {
  /** Drafts already used on this trip, before this one. */
  runsUsed: number;
  /** The user's ROVE point balance. */
  points: number;
  onClose: () => void;
  /** Called once the draft actually starts, with how it was paid for. */
  onSpend: (method: 'free' | 'points' | 'purchase') => void;
}) {
  // Freeze the count as it was when the dialog opened: `onSpend` bumps the
  // parent's counter immediately, and reading the live prop would flip this
  // draft from "free" to "paid" mid-render.
  const [usedAtOpen] = useState(runsUsed);
  const freeLeft = Math.max(0, AI_CREDITS.freePerTrip - usedAtOpen);

  const [payment, setPayment] = useState<'free' | 'points' | 'purchase' | null>(
    freeLeft > 0 ? 'free' : null
  );
  const started = payment !== null;

  const [step, setStep] = useState(0);
  const done = started && step >= STEPS.length;

  // A free draft is spent the moment the dialog opens with credit left.
  useEffect(() => {
    if (freeLeft > 0) onSpend('free');
    // Mount only — re-running this would double-count the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!started || step >= STEPS.length) return;
    const timer = setTimeout(() => setStep((s) => s + 1), step === 0 ? 700 : 1_100);
    return () => clearTimeout(timer);
  }, [started, step]);

  function unlock(method: 'points' | 'purchase') {
    onSpend(method);
    setPayment(method);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        className="bg-espresso/40 absolute inset-0 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="ปิด"
      />

      <div className="bg-bg rounded-t-brand-lg sm:rounded-brand-lg shadow-warm-lg animate-rove-rise relative z-10 w-full max-w-lg p-5 pb-8 sm:pb-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <RoveMark
              className={cn('text-primary size-6', started && !done && 'animate-rove-spin')}
            />
            <div>
              <p className="font-display text-espresso font-bold">
                {!started
                  ? 'ใช้สิทธิ์ร่างฟรีครบแล้ว'
                  : done
                    ? 'ร่างแพลนเสร็จแล้ว'
                    : 'กำลังร่างแพลนให้...'}
              </p>
              <p className="text-muted text-xs">
                {!started
                  ? `ทริปนี้ร่างฟรีได้ ${AI_CREDITS.freePerTrip} ครั้ง — ใช้ครบแล้ว`
                  : done
                    ? `${planStats.days} วัน · ${planStats.items} รายการ · ใช้เวลา 42 วินาที`
                    : 'ปกติใช้เวลาไม่เกิน 1 นาที'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted p-1" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>

        {/* ------------------------------------------------------ paywall */}
        {!started ? (
          <div className="space-y-2.5">
            <Card accent="sun" className="p-4">
              <div className="flex items-start gap-3">
                <Wallet className="text-espresso mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-espresso text-sm font-semibold">
                    ใช้ {AI_CREDITS.pointsPerRun} แต้ม ร่างอีกครั้ง
                  </p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ตอนนี้มี <span className="nums">{points.toLocaleString('th-TH')}</span> แต้ม —
                    ร่างได้อีก {Math.floor(points / AI_CREDITS.pointsPerRun)} ครั้ง
                    โดยไม่ต้องจ่ายเงิน
                  </p>
                </div>
              </div>
              <Button
                block
                className="mt-3"
                disabled={points < AI_CREDITS.pointsPerRun}
                onClick={() => unlock('points')}
              >
                <Sparkles className="size-4" /> ใช้แต้มร่างเลย
              </Button>
            </Card>

            <Card className="p-4">
              <p className="text-espresso text-sm font-semibold">
                หรือซื้อเพิ่มครั้งละ ฿{AI_CREDITS.priceThb}
              </p>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                จ่ายครั้งเดียว ใช้กับทริปนี้ ไม่ผูกมัดรายเดือน
              </p>
              <Button variant="outline" block className="mt-3" onClick={() => unlock('purchase')}>
                ซื้อ 1 ครั้ง ฿{AI_CREDITS.priceThb}
              </Button>
            </Card>

            <Card accent="matcha" className="p-4">
              <div className="flex items-start gap-3">
                <Gift className="text-espresso mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-espresso text-sm font-semibold">ได้แต้มฟรีจากการชวนเพื่อน</p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ชวนเพื่อนมาใช้ ROVE ได้ {AI_CREDITS.pointsPerReferral} แต้มต่อคน
                    และได้อีกเมื่อมีคนจองตามทริปที่เปิดสาธารณะไว้
                  </p>
                  <Button variant="soft" size="sm" className="mt-2.5">
                    <UserPlus className="size-3.5" /> คัดลอกลิงก์ชวนเพื่อน
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {/* ----------------------------------------------------- progress */}
        {started ? (
          <>
            {payment === 'free' ? (
              <Badge tone="matcha" size="md" className="mb-3">
                ใช้สิทธิ์ฟรีครั้งที่ {usedAtOpen + 1} จาก {AI_CREDITS.freePerTrip}
              </Badge>
            ) : payment === 'points' ? (
              <Badge tone="primary" size="md" className="mb-3">
                ร่างรอบนี้ใช้ {AI_CREDITS.pointsPerRun} แต้ม
              </Badge>
            ) : (
              <Badge tone="primary" size="md" className="mb-3">
                ร่างรอบนี้ซื้อเพิ่ม ฿{AI_CREDITS.priceThb}
              </Badge>
            )}

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
          </>
        ) : null}

        {done ? (
          <div className="animate-rove-rise mt-5">
            <p className="section-label mb-2">ROVE ขอถามกลับ {OPEN_QUESTIONS.length} ข้อ</p>
            <ul className="space-y-2">
              {OPEN_QUESTIONS.map((q) => (
                <li key={q} className="bg-surface rounded-brand-sm p-3">
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
            <p className="text-muted mt-2 text-center text-[11px]">
              เหลือสิทธิ์ร่างฟรีอีก {Math.max(0, AI_CREDITS.freePerTrip - usedAtOpen - 1)} ครั้ง · มี{' '}
              <span className="nums">{points.toLocaleString('th-TH')}</span> แต้มไว้ร่างต่อ
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
