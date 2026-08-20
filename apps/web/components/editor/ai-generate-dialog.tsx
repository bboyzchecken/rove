'use client';

import { useEffect, useState } from 'react';
import { Check, CreditCard, Gift, Sparkles, UserPlus, Wallet, X } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useMe } from '@/features/auth/queries';
import { useAiCredits, useAiDraft, useBuyAiCredits } from '@/features/ai/queries';
import { useWishlist } from '@/features/wishlist/queries';
import { mockSkips } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * "ให้ AI ร่างแพลน" (M4 — W4.1) plus the meter in front of it.
 *
 * Drafts are metered (§16): the trip's included runs come first, then points
 * or a purchase. The gate lives inside this dialog rather than on a separate
 * page, because the moment someone wants another draft is the moment to show
 * what a draft costs — and how to earn it back by inviting friends.
 *
 * Progress is the job's own, streamed from the repository (SSE in live mode,
 * a timer in mock mode). Nothing here is on a fake clock.
 */
const POINTS_PER_RUN = 300;
const POINTS_PER_REFERRAL = 150;

export function AiGenerateDialog({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: credits } = useAiCredits(tripId);
  const { data: me } = useMe();
  const { data: wishlist = [] } = useWishlist(tripId);
  const buyCredits = useBuyAiCredits(tripId);
  const draft = useAiDraft(tripId);

  const [brief, setBrief] = useState('');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'packed'>('balanced');
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);
  // Frozen when the run starts: the credit count updates the moment the job is
  // queued, and reading it live would relabel a free draft as a paid one
  // halfway through its own progress bar.
  const [freeAtStart, setFreeAtStart] = useState<number | null>(null);

  const quota = (credits?.included ?? 0) + (credits?.extra ?? 0);
  const runsLeft = Math.max(0, quota - (credits?.used ?? 0));
  const freeLeft = Math.max(0, (credits?.included ?? 0) - (credits?.used ?? 0));
  const points = me?.points ?? 0;
  const canUsePoints = points >= POINTS_PER_RUN;

  // Preselect whichever option the user can actually complete right now, but
  // let an explicit tap win — derived, so it never fights a re-render.
  const [chosen, setChosen] = useState<'points' | 'purchase' | null>(null);
  const choice = chosen ?? (canUsePoints ? 'points' : 'purchase');
  const setChoice = setChosen;

  // Leaving the dialog abandons the job's UI state, not the job itself: a
  // finished draft is still applied from the plan board.
  useEffect(() => {
    if (!open) draft.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const job = draft.job;
  const steps = job ? Math.round(job.progress * 100) : 0;

  async function unlock() {
    const channel = choice === 'points' ? `${POINTS_PER_RUN} แต้ม ROVE` : (credits?.payChannels[0] ?? 'บัตรเครดิต');
    const result = await buyCredits.mutateAsync({ quantity: 1, channel });
    setPurchaseNote(
      result.simulated
        ? `โหมดทดลอง: ยังไม่ได้ตัดเงินจริง (${channel}) — เพิ่มสิทธิ์ร่างให้แล้ว 1 ครั้ง`
        : `ชำระผ่าน ${channel} เรียบร้อย`,
    );
  }

  async function start() {
    setFreeAtStart(freeLeft);
    await draft.start({ kind: 'draft', brief: brief.trim() || undefined, pace });
  }

  async function apply() {
    await draft.apply.mutateAsync();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        className="bg-espresso/40 absolute inset-0 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="ปิด"
      />

      <div className="bg-bg rounded-t-brand-lg sm:rounded-brand-lg shadow-warm-lg animate-rove-rise relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5 pb-8 sm:pb-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <RoveMark
              className={cn('text-primary size-6', draft.isRunning && 'animate-rove-spin')}
            />
            <div>
              <p className="font-display text-espresso font-bold">
                {draft.isDone
                  ? 'ร่างแพลนเสร็จแล้ว'
                  : draft.isRunning
                    ? 'กำลังร่างแพลนให้…'
                    : runsLeft > 0
                      ? 'ให้ AI ร่างแพลน'
                      : 'ใช้สิทธิ์ร่างครบแล้ว'}
              </p>
              <p className="text-muted text-xs">
                {draft.isDone
                  ? `${job?.result?.days.length ?? 0} วัน · ${job?.result?.days.reduce((n, d) => n + d.items.length, 0) ?? 0} รายการ`
                  : draft.isRunning
                    ? (job?.step ?? 'กำลังเริ่ม')
                    : runsLeft > 0
                      ? `ร่างได้อีก ${runsLeft} ครั้ง · อ่านที่อยากไป ${wishlist.length} รายการ`
                      : 'ร่างต่อได้ด้วยแต้มหรือจ่ายเงิน'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted p-1" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>

        {/* ------------------------------------------------------- brief */}
        {!job && runsLeft > 0 ? (
          <div className="space-y-3.5">
            <div>
              <p className="section-label mb-2">อยากให้แพลนเป็นแบบไหน</p>
              <div className="flex gap-1.5">
                {(
                  [
                    { key: 'relaxed', label: 'ชิล ๆ' },
                    { key: 'balanced', label: 'กำลังดี' },
                    { key: 'packed', label: 'อัดแน่น' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setPace(option.key)}
                    className={cn(
                      'flex-1 rounded-full px-3 py-2 text-xs font-semibold transition',
                      pace === option.key ? 'bg-espresso text-bg' : 'bg-surface text-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-muted mb-1.5 block text-[11px] font-semibold">
                บอกเพิ่มได้ (ไม่ใส่ก็ได้)
              </span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="เช่น ขอเช้าไม่ต้องตื่นก่อน 8 โมง และเผื่อเวลาช้อปวันสุดท้าย"
                className="bg-surface text-espresso w-full rounded-2xl p-3.5 text-xs outline-none"
              />
            </label>

            {mockSkips.aiGeneration ? (
              <Badge tone="sun" size="md">
                โหมดทดลอง: ใช้ร่างตัวอย่าง ไม่ได้เรียกโมเดลจริง
              </Badge>
            ) : null}

            <Button block size="lg" onClick={() => void start()}>
              <Sparkles className="size-4" />
              {freeLeft > 0 ? 'ร่างเลย ใช้สิทธิ์ฟรี' : 'ร่างเลย'}
            </Button>

            {draft.error ? <p className="text-danger text-xs">{draft.error}</p> : null}
          </div>
        ) : null}

        {/* ------------------------------------------------------ paywall */}
        {!job && runsLeft === 0 ? (
          <div>
            <p className="section-label mb-2">เลือกวิธีร่างต่อ</p>

            <div className="space-y-2" role="radiogroup" aria-label="วิธีจ่ายค่าร่างแพลน">
              <PayOption
                selected={choice === 'points'}
                disabled={!canUsePoints}
                onSelect={() => setChoice('points')}
                icon={<Wallet className="size-4" />}
                title="ใช้แต้ม ROVE"
                price={`${POINTS_PER_RUN} แต้ม`}
                note={
                  canUsePoints
                    ? `มีอยู่ ${points.toLocaleString('th-TH')} แต้ม — พอร่างได้อีก ${Math.floor(points / POINTS_PER_RUN)} ครั้ง`
                    : `มีอยู่ ${points.toLocaleString('th-TH')} แต้ม ยังไม่พอ ขาดอีก ${(POINTS_PER_RUN - points).toLocaleString('th-TH')} แต้ม`
                }
                badge={canUsePoints ? 'ไม่ต้องจ่ายเงิน' : undefined}
              />

              <PayOption
                selected={choice === 'purchase'}
                onSelect={() => setChoice('purchase')}
                icon={<CreditCard className="size-4" />}
                title="จ่ายเงินครั้งเดียว"
                price={`฿${credits?.pricePerDraftThb ?? 39}`}
                note="ใช้กับทริปนี้ ไม่ผูกมัดรายเดือน ไม่ตัดเงินอัตโนมัติ"
                channels={credits?.payChannels}
              />
            </div>

            <Button
              block
              size="lg"
              className="mt-4"
              disabled={(choice === 'points' && !canUsePoints) || buyCredits.isPending}
              onClick={() => void unlock()}
            >
              <Sparkles className="size-4" />
              {buyCredits.isPending
                ? 'กำลังดำเนินการ…'
                : choice === 'points'
                  ? `ใช้ ${POINTS_PER_RUN} แต้มแล้วร่างเลย`
                  : `จ่าย ฿${credits?.pricePerDraftThb ?? 39} แล้วร่างเลย`}
            </Button>

            {purchaseNote ? <p className="text-muted mt-2 text-[11px]">{purchaseNote}</p> : null}

            <Card accent="matcha" className="mt-3 p-4">
              <div className="flex items-start gap-3">
                <Gift className="text-espresso mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-espresso text-sm font-semibold">อยากได้แต้มเพิ่มแบบไม่จ่าย?</p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ชวนเพื่อนมาใช้ ROVE ได้ {POINTS_PER_REFERRAL} แต้มต่อคน
                    และได้อีกทุกครั้งที่มีคนจองตามทริปที่คุณเปิดสาธารณะไว้
                  </p>
                  <Button variant="soft" size="sm" className="mt-2.5" onClick={onClose}>
                    <UserPlus className="size-3.5" /> ไปหน้าชวนเพื่อน
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {/* ----------------------------------------------------- progress */}
        {job && !draft.isDone ? (
          <>
            <Badge tone={(freeAtStart ?? 0) > 0 ? 'matcha' : 'primary'} size="md" className="mb-3">
              {(freeAtStart ?? 0) > 0
                ? `ร่างรอบนี้ใช้สิทธิ์ฟรี · เหลืออีก ${freeLeft} ครั้ง`
                : 'ร่างรอบนี้ใช้สิทธิ์ที่ซื้อไว้'}
            </Badge>

            <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${steps}%` }}
              />
            </div>
            <p className="text-espresso mt-3 flex items-center gap-2 text-sm font-medium">
              <span className="bg-primary text-primary-fg flex size-6 items-center justify-center rounded-full text-[10px] font-bold">
                {Math.max(1, Math.round(job.progress * 5))}
              </span>
              {job.step}
            </p>
            <p className="text-muted mt-1 text-[11px]">ปกติใช้เวลาไม่เกิน 1 นาที</p>
          </>
        ) : null}

        {/* --------------------------------------------------------- done */}
        {draft.isDone && job?.result ? (
          <div className="animate-rove-rise mt-1">
            <Badge tone="matcha" size="md" className="mb-3">
              <Check className="size-3.5" /> ร่างเสร็จแล้ว
            </Badge>

            <p className="section-label mb-2">ROVE ขอถามกลับ {job.result.openQuestions.length} ข้อ</p>
            <ul className="space-y-2">
              {job.result.openQuestions.map((question) => (
                <li key={question} className="bg-surface rounded-brand-sm p-3">
                  <p className="text-espresso text-xs leading-relaxed">{question}</p>
                </li>
              ))}
            </ul>

            <Button
              block
              size="lg"
              className="mt-4"
              onClick={() => void apply()}
              disabled={draft.apply.isPending}
            >
              <Sparkles className="size-4" />
              {draft.apply.isPending ? 'กำลังใส่ลงแพลน…' : 'ใช้ร่างนี้เป็นแพลน'}
            </Button>
            <p className="text-muted mt-2 text-center text-[11px]">
              ใส่แล้วยังแก้ไทม์ไลน์เองได้ทุกอย่าง · เหลือสิทธิ์ร่างอีก {runsLeft} ครั้ง
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
