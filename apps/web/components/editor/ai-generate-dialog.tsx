'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Gift, ReceiptText, RotateCcw, Sparkles, Users, X } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldLabel, Textarea, fieldClass } from '@/components/ui/field';
import { useAiCredits, useAiDraft, useBuyTripPass } from '@/features/ai/queries';
import { useIsStubbed } from '@/features/meta/queries';
import { useWishlist } from '@/features/wishlist/queries';
import type { Order } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "ให้ AI ร่างแพลน" (M4 — W4.1) plus the gate in front of it.
 *
 * The trip's free drafts come first; after that the trip is unlocked once with
 * a Trip Pass (M26 — W26.2). The gate lives inside this dialog rather than on a
 * separate page, because the moment someone wants another draft is the moment
 * to say what it costs.
 *
 * What it costs is one sentence, and its second half matters more than its
 * first: the pass comes back in full if the trip is booked through ROVE. A
 * commission is worth several times the pass, so the refund is not a discount
 * we are being nice about — it is the paywall getting out of the way of the
 * larger revenue. Saying so plainly is both the honest line and the better
 * pitch, which is why it sits on the button and not in the terms (W26.3).
 *
 * Progress is the job's own, streamed from the repository (SSE in live mode,
 * a timer in mock mode). Nothing here is on a fake clock.
 */
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
  const { data: wishlist = [] } = useWishlist(tripId);
  const buyPass = useBuyTripPass(tripId);
  const draft = useAiDraft(tripId);
  // Asked of whatever is actually serving this screen, not of the build flag:
  // a `live` web app in front of an API with no ANTHROPIC_API_KEY still gets a
  // canned draft, and used to say nothing about it.
  const aiIsStubbed = useIsStubbed('ai');

  const [brief, setBrief] = useState('');
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'packed'>('balanced');
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);
  // The receipt the purchase produced (M20) — shown as a link, because the one
  // moment a receipt is worth offering is right after paying.
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  // Frozen when the run starts: the credit count updates the moment the job is
  // queued, and reading it live would relabel a free draft as a paid one
  // halfway through its own progress bar.
  const [freeAtStart, setFreeAtStart] = useState<number | null>(null);

  const hasPass = credits?.hasPass ?? false;
  const quota = (credits?.included ?? 0) + (credits?.extra ?? 0);
  const freeLeft = Math.max(0, (credits?.included ?? 0) - (credits?.used ?? 0));
  // Under a pass the meter is history, not a limit.
  const runsLeft = hasPass ? Infinity : Math.max(0, quota - (credits?.used ?? 0));
  const passPrice = credits?.passPriceThb ?? 0;
  const perPerson = credits?.passPerPersonThb ?? passPrice;

  // ช่องกรอกโค้ดส่วนลด (A12.10) ยังปิดอยู่ตั้งแต่ 26 ส.ค. 2569 รอ Phase 6:
  // โค้ดกำลังย้ายไปหน้า "สิทธิพิเศษ/คูปองของฉัน" ของตัวเอง และจะเลิกเป็นของ
  // ROVE-only (เช่นโค้ดพาร์ตเนอร์) — วิธีใช้โค้ดจึงต้องออกแบบใหม่ทั้งอัน
  // ไม่ใช่ช่องพิมพ์มือข้างปุ่มจ่ายเงิน (docs/phase-6-points-economy.md)
  //
  // "ใช้แต้ม ROVE" หายไปตั้งแต่ M26 เพราะสิ่งที่แต้มเคยซื้อ (ร่างทีละครั้ง)
  // ไม่มีขายแล้ว ปลายทางของแต้มตอนนี้คือโค้ดส่วนลดค่า Trip Pass ซึ่งรอโรงมินต์
  // เปิดใน Phase 6 — การ์ด "ชวนเพื่อน" ด้านล่างจึงพูดตามจริงว่ายังไม่เปิด

  // Same rule for the channel: the first accepted one unless the user says
  // otherwise. Which one it was ends up on the receipt, so it cannot be a
  // guess made at purchase time.
  const channels = credits?.payChannels ?? [];
  const channel = channels.find((c) => c.id === channelId) ?? channels[0];

  // Opening or closing the dialog wipes what the last visit left on screen —
  // adjusted during render rather than in an effect, which is the pattern React
  // documents for "reset state when a prop changes" and avoids the extra pass a
  // setState-in-effect costs.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setReceipt(null);
    setPurchaseNote(null);
  }

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
    const label = channel?.label ?? 'บัตรเครดิต';

    const result = await buyPass.mutateAsync({
      method: channel?.id ?? 'card',
      channel: label,
    });

    setReceipt(result.order);
    setPurchaseNote(
      result.simulated
        ? `โหมดทดลอง: ยังไม่ได้ตัดเงินจริง (${label}) — ปลดล็อกทริปนี้ให้แล้ว`
        : `ชำระผ่าน ${label} เรียบร้อย — ทริปนี้ปลดล็อกแล้วทั้งห้อง`,
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
                      : 'ใช้สิทธิ์ร่างฟรีครบแล้ว'}
              </p>
              <p className="text-muted text-xs">
                {draft.isDone
                  ? `${job?.result?.days.length ?? 0} วัน · ${job?.result?.days.reduce((n, d) => n + d.items.length, 0) ?? 0} รายการ`
                  : draft.isRunning
                    ? (job?.step ?? 'กำลังเริ่ม')
                    : hasPass
                      ? `ร่างได้ไม่จำกัด · อ่านที่อยากไป ${wishlist.length} รายการ`
                      : runsLeft > 0
                        ? `ร่างได้อีก ${runsLeft} ครั้ง · อ่านที่อยากไป ${wishlist.length} รายการ`
                        : 'ปลดล็อกทริปนี้แล้วร่างต่อได้ไม่จำกัด'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted p-1" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>

        {/* ------------------------------------------------ what was paid */}
        {/* Outside the paywall on purpose: buying a draft is exactly what makes
            the paywall disappear, so a confirmation rendered inside it would be
            unmounted by the event it is confirming — and the receipt would be
            gone before anyone read its number. */}
        {purchaseNote && !job ? (
          <Card accent="matcha" className="mb-4 p-3.5">
            <p className="text-espresso text-xs leading-relaxed">{purchaseNote}</p>
            {receipt ? (
              <Link
                href={`/billing/${receipt.id}`}
                className="text-primary mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold"
              >
                <ReceiptText className="size-3.5" />
                ดูใบเสร็จ {receipt.number}
              </Link>
            ) : null}
          </Card>
        ) : null}

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
              <FieldLabel>บอกเพิ่มได้ (ไม่ใส่ก็ได้)</FieldLabel>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="เช่น ขอเช้าไม่ต้องตื่นก่อน 8 โมง และเผื่อเวลาช้อปวันสุดท้าย"
                className={cn(fieldClass, 'text-xs')}
              />
            </label>

            {aiIsStubbed ? (
              <Badge tone="sun" size="md">
                ตอนนี้ใช้ร่างตัวอย่าง ยังไม่ได้เรียกโมเดลจริง
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
            <p className="section-label mb-2">ปลดล็อกทริปนี้</p>

            {/* The offer, stated once and in full: price, who it covers, what
                comes back — in that order, because the last one is the part
                that decides it (W26.2 / W26.3). */}
            <Card accent="primary" className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-espresso text-lg font-extrabold">Trip Pass</p>
                <p className="font-display text-espresso nums text-2xl font-extrabold">
                  {formatMoney(passPrice, 'THB')}
                </p>
              </div>

              <ul className="mt-3 space-y-2">
                <PassPoint icon={<Sparkles className="size-4" />}>
                  ให้ AI ร่างและปรับแพลนได้ <strong className="text-espresso">ไม่จำกัด</strong> ในทริปนี้
                </PassPoint>
                <PassPoint icon={<Users className="size-4" />}>
                  ปลดล็อกให้ <strong className="text-espresso">ทั้งห้อง</strong> — หารกันแล้วคนละ{' '}
                  <span className="nums">{formatMoney(perPerson, 'THB')}</span>
                </PassPoint>
                <PassPoint icon={<RotateCcw className="size-4" />}>
                  จองผ่าน ROVE แล้ว <strong className="text-espresso">คืนให้เต็มจำนวน</strong> —
                  เท่ากับไม่ได้จ่ายค่าวางแผนเลย
                </PassPoint>
              </ul>
            </Card>

            {/* The channel is picked here rather than on a next screen: it is
                what the receipt will say, and a method that turns out not to
                be accepted is the failure this row prevents. */}
            {channels.length > 0 ? (
              <div className="mt-2.5" role="radiogroup" aria-label="ช่องทางชำระเงิน">
                <p className="text-muted mb-1.5 text-[11px] font-semibold">ช่องทางชำระเงิน</p>
                <div className="flex flex-wrap gap-1.5">
                  {channels.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={option.id === channel?.id}
                      onClick={() => setChannelId(option.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                        option.id === channel?.id
                          ? 'bg-espresso text-bg'
                          : 'bg-surface text-muted hover:bg-border/60',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {buyPass.isError ? (
              <p className="text-danger mt-2 text-xs">
                {buyPass.error instanceof Error
                  ? buyPass.error.message
                  : 'จ่ายไม่สำเร็จ — ลองใหม่อีกครั้ง'}
              </p>
            ) : null}

            {/* The refund is on the button, not under it. It is the condition
                the money is being handed over on, and a condition that only
                appears in the terms is a condition nobody read. */}
            <Button
              block
              size="lg"
              className="mt-4"
              disabled={buyPass.isPending}
              onClick={() => void unlock()}
            >
              <Sparkles className="size-4" />
              {buyPass.isPending
                ? 'กำลังดำเนินการ…'
                : `ปลดล็อก ${formatMoney(passPrice, 'THB')} — ได้คืนถ้าจองผ่าน ROVE`}
            </Button>
            <p className="text-muted mt-2 text-center text-[11px] leading-relaxed">
              คืนเป็นเครดิตเต็มจำนวนเมื่อมีการจองผ่าน ROVE จากทริปนี้ · คืนหนึ่งครั้งต่อทริป
            </p>

            <Card accent="matcha" className="mt-3 p-4">
              <div className="flex items-start gap-3">
                <Gift className="text-espresso mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-espresso text-sm font-semibold">สะสมแต้มไว้ลดค่า Trip Pass</p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ชวนเพื่อนมาใช้ ROVE ได้ {POINTS_PER_REFERRAL} แต้มต่อคน
                    และได้อีกทุกครั้งที่มีคนจองตามทริปที่คุณเปิดสาธารณะไว้ ·
                    ตอนนี้การแลกแต้มเป็นโค้ดส่วนลดปิดปรับปรุงอยู่ แต้มที่สะสมไว้ไม่หายไปไหน
                  </p>
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

            <p className="section-label mb-2">
              ROVE ขอถามกลับ {job.result.openQuestions.length} ข้อ
            </p>
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

/** One line of what the pass buys. */
function PassPoint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="text-muted flex items-start gap-2.5 text-xs leading-relaxed">
      <span className="text-primary mt-px shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}
