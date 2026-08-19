'use client';

import { useEffect, useState } from 'react';
import { Check, CreditCard, Gift, Sparkles, UserPlus, Wallet, X } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AI_CREDITS, AI_PAY_CHANNELS, OPEN_QUESTIONS, planStats, WISHLIST } from '@/lib/mock';
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
    freeLeft > 0 ? 'free' : null,
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

  // Preselect whichever option the user can actually complete right now.
  const canUsePoints = points >= AI_CREDITS.pointsPerRun;
  const [choice, setChoice] = useState<'points' | 'purchase'>(canUsePoints ? 'points' : 'purchase');

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
          <div>
            <p className="section-label mb-2">เลือกวิธีร่างต่อ</p>

            <div className="space-y-2" role="radiogroup" aria-label="วิธีจ่ายค่าร่างแพลน">
              <PayOption
                selected={choice === 'points'}
                disabled={!canUsePoints}
                onSelect={() => setChoice('points')}
                icon={<Wallet className="size-4" />}
                title="ใช้แต้ม ROVE"
                price={`${AI_CREDITS.pointsPerRun} แต้ม`}
                note={
                  canUsePoints
                    ? `มีอยู่ ${points.toLocaleString('th-TH')} แต้ม — พอร่างได้อีก ${Math.floor(
                        points / AI_CREDITS.pointsPerRun,
                      )} ครั้ง`
                    : `มีอยู่ ${points.toLocaleString('th-TH')} แต้ม ยังไม่พอ ขาดอีก ${(
                        AI_CREDITS.pointsPerRun - points
                      ).toLocaleString('th-TH')} แต้ม`
                }
                badge={canUsePoints ? 'ไม่ต้องจ่ายเงิน' : undefined}
              />

              <PayOption
                selected={choice === 'purchase'}
                onSelect={() => setChoice('purchase')}
                icon={<CreditCard className="size-4" />}
                title="จ่ายเงินครั้งเดียว"
                price={`฿${AI_CREDITS.priceThb}`}
                note="ใช้กับทริปนี้ ไม่ผูกมัดรายเดือน ไม่ตัดเงินอัตโนมัติ"
                channels={AI_PAY_CHANNELS}
              />
            </div>

            <Button
              block
              size="lg"
              className="mt-4"
              disabled={choice === 'points' && !canUsePoints}
              onClick={() => unlock(choice)}
            >
              <Sparkles className="size-4" />
              {choice === 'points'
                ? `ใช้ ${AI_CREDITS.pointsPerRun} แต้มแล้วร่างเลย`
                : `จ่าย ฿${AI_CREDITS.priceThb} แล้วร่างเลย`}
            </Button>

            <Card accent="matcha" className="mt-3 p-4">
              <div className="flex items-start gap-3">
                <Gift className="text-espresso mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-espresso text-sm font-semibold">อยากได้แต้มเพิ่มแบบไม่จ่าย?</p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ชวนเพื่อนมาใช้ ROVE ได้ {AI_CREDITS.pointsPerReferral} แต้มต่อคน
                    และได้อีกทุกครั้งที่มีคนจองตามทริปที่คุณเปิดสาธารณะไว้
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
              เหลือสิทธิ์ร่างฟรีอีก {Math.max(0, AI_CREDITS.freePerTrip - usedAtOpen - 1)} ครั้ง ·
              มี <span className="nums">{points.toLocaleString('th-TH')}</span> แต้มไว้ร่างต่อ
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One payment choice. The price sits on the same line as the name, and the
 * accepted channels are printed rather than hidden behind the next screen —
 * finding out your method is not supported after committing is the failure
 * this row exists to prevent.
 */
function PayOption({
  selected,
  disabled = false,
  onSelect,
  icon,
  title,
  price,
  note,
  badge,
  channels,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  price: string;
  note: string;
  badge?: string;
  channels?: string[];
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'rounded-brand w-full border-2 p-3.5 text-left transition',
        selected ? 'border-primary bg-primary/8' : 'border-border bg-surface hover:border-muted/40',
        disabled && 'cursor-not-allowed opacity-55',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-primary' : 'border-muted/40',
          )}
          aria-hidden="true"
        >
          {selected ? <span className="bg-primary size-2.5 rounded-full" /> : null}
        </span>

        <span className="text-espresso flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title}
          {badge ? (
            <Badge tone="matcha" className="ml-1">
              {badge}
            </Badge>
          ) : null}
        </span>

        <span className="text-espresso nums shrink-0 text-sm font-bold">{price}</span>
      </div>

      <p className="text-muted mt-1.5 pl-8 text-xs leading-relaxed">{note}</p>

      {channels ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
          {channels.map((channel) => (
            <span
              key={channel}
              className="bg-bg text-muted rounded-full px-2 py-0.5 text-[11px] font-medium"
            >
              {channel}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
