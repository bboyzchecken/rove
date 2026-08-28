'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy, Gift, Ticket } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useRedeemPoints, useRedemptions } from '@/features/rewards/queries';
import type { DiscountCode, RedemptionTier } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * แลกแต้มเป็นส่วนลด (M22 — A12.10) — **ปิดใช้งานตั้งแต่ 26 ส.ค. 2569**
 *
 * ไม่มีหน้าไหน import ไฟล์นี้แล้ว (เอาออกจาก profile-screen) และฝั่ง API ก็ปฏิเสธ
 * `POST /users/me/points/redeem` ด้วย `domain.RedemptionOpen = false` เก็บไฟล์ไว้
 * เพราะ Phase 6 จะรื้อ flow นี้ไปอยู่หน้า "สิทธิพิเศษ" + "คูปองของฉัน" และตรรกะ
 * ยืนยันก่อนหักแต้มด้านล่างคือส่วนที่ยังถูกอยู่ ที่ผิดคือ *อัตรา* กับ *ที่ทาง*
 * ของมัน ไม่ใช่ UX — ดู docs/phase-6-points-economy.md
 *
 * Redeeming burns the points immediately, so the card says what it costs
 * before the button and what it bought after it — a balance that silently
 * dropped is the single fastest way to lose trust in a points system.
 *
 * And because the burn is immediate, **a tap is not enough**: tapping a tier
 * opens a confirmation rather than spending. This is the one control on the
 * profile that cannot be undone — there is no "ยกเลิกโค้ด" endpoint and there
 * should not be, since a code that can be handed back is a code that can be
 * used first and handed back second (§A12.10, "โค้ดที่มีอยู่คือโค้ดที่จ่ายแล้ว").
 * A mis-tap costing 2,400 points is a support ticket the dialog prevents.
 */
export function PointsRedeemCard() {
  const { data: board, isLoading } = useRedemptions();
  const redeem = useRedeemPoints();
  const [copied, setCopied] = useState('');
  /** The tier awaiting confirmation, or null when the sheet is closed. */
  const [pending, setPending] = useState<RedemptionTier | null>(null);

  if (isLoading) {
    return (
      <section>
        <SectionHeader label="แลกแต้ม" />
        <div className="rounded-brand bg-surface h-36 animate-pulse" />
      </section>
    );
  }
  if (!board) return null;

  const unused = board.codes.filter((code) => code.usable);
  const spent = board.codes.filter((code) => !code.usable);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // Clipboard blocked — the code is on screen and selectable.
    }
  }

  return (
    <section>
      <SectionHeader label="แลกแต้ม" />

      <Card className="p-4">
        <p className="text-ink flex items-center gap-2 text-sm font-medium">
          <Gift className="text-primary size-4" />
          แลกเป็นโค้ดส่วนลด
        </p>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          ใช้ลดค่าร่างแพลนด้วย AI ในแอป · แลกแล้วแต้มจะถูกหักทันที และโค้ดใช้ได้ครั้งเดียวภายใน 180 วัน
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {board.tiers.map((tier) => (
            <button
              key={tier.amountThb}
              disabled={!tier.afford || redeem.isPending}
              onClick={() => setPending(tier)}
              className={cn(
                'rounded-brand p-3 text-center transition',
                tier.afford
                  ? 'bg-surface hover:bg-border'
                  : 'bg-surface cursor-not-allowed opacity-50',
              )}
            >
              <span className="text-ink nums block text-sm font-bold">
                ฿{tier.amountThb}
              </span>
              <span className="text-muted nums block text-[11px]">
                {tier.points.toLocaleString('th-TH')} แต้ม
              </span>
            </button>
          ))}
        </div>

        {redeem.isError ? (
          <p className="text-warning mt-2 text-xs">แลกไม่สำเร็จ — ลองใหม่อีกครั้ง</p>
        ) : null}
      </Card>

      {unused.length > 0 ? (
        <Card className="divide-border mt-3 divide-y">
          {unused.map((code) => (
            <CodeLine
              key={code.code}
              code={code}
              copied={copied === code.code}
              onCopy={() => void copy(code.code)}
            />
          ))}
        </Card>
      ) : null}

      {spent.length > 0 ? (
        <p className="text-muted mt-2 text-[11px]">
          ใช้ไปแล้วหรือหมดอายุ {spent.length} โค้ด
        </p>
      ) : null}

      <ConfirmRedeem
        tier={pending}
        balance={board.balance}
        pendingRequest={redeem.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          redeem.mutate(pending.amountThb, {
            // Closed on success only. A failed redemption leaves the sheet
            // open with the error visible, because the alternative is a
            // dialog that vanishes and a balance that did not move.
            onSuccess: () => setPending(null),
          });
        }}
        error={redeem.isError}
      />
    </section>
  );
}

/**
 * The last step before the points go.
 *
 * It states the three things that decide whether this is a mistake: what it
 * costs, what is left afterwards, and that it cannot be undone. The balance
 * after is spelled out rather than left as arithmetic — "2,400 แต้ม" and
 * "เหลือ 40 แต้ม" are the same fact and only the second one stops the tap.
 */
function ConfirmRedeem({
  tier,
  balance,
  pendingRequest,
  onConfirm,
  onCancel,
  error,
}: {
  tier: RedemptionTier | null;
  balance: number;
  pendingRequest: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  error: boolean;
}) {
  const remaining = tier ? balance - tier.points : 0;

  return (
    <Sheet
      open={tier !== null}
      onClose={pendingRequest ? () => {} : onCancel}
      title="ยืนยันการแลกแต้ม"
      description="แลกแล้วยกเลิกไม่ได้"
      footer={
        <div className="flex gap-2">
          <Button variant="soft" block disabled={pendingRequest} onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button block disabled={pendingRequest} onClick={onConfirm}>
            {pendingRequest ? 'กำลังแลก…' : 'ยืนยันแลก'}
          </Button>
        </div>
      }
    >
      {tier ? (
        <>
          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted text-xs">โค้ดส่วนลด</span>
              <span className="font-display text-ink nums text-xl font-bold">
                ฿{tier.amountThb.toLocaleString('th-TH')}
              </span>
            </div>
            <div className="border-border mt-3 space-y-2 border-t pt-3">
              <Line label="ใช้แต้ม" value={`−${tier.points.toLocaleString('th-TH')}`} />
              <Line label="แต้มคงเหลือหลังแลก" value={remaining.toLocaleString('th-TH')} strong />
            </div>
          </Card>

          <p className="text-muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
            <AlertTriangle className="text-warning mt-px size-3.5 shrink-0" />
            แต้มถูกหักทันทีที่กดยืนยัน · โค้ดใช้ได้ครั้งเดียวภายใน 180 วัน และคืนเป็นแต้มไม่ได้
          </p>

          {error ? (
            <p className="text-danger mt-2 text-xs">แลกไม่สำเร็จ — แต้มยังอยู่ครบ ลองใหม่อีกครั้ง</p>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted text-xs">{label}</span>
      <span
        className={cn(
          'nums text-sm',
          strong ? 'text-ink font-bold' : 'text-ink font-medium',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CodeLine({
  code,
  copied,
  onCopy,
}: {
  code: DiscountCode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <Ticket className="text-primary size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-ink nums text-sm font-bold tracking-wide">{code.code}</p>
        <p className="text-muted text-[11px]">
          ลด ฿{code.amountThb.toLocaleString('th-TH')} · หมดอายุ{' '}
          {new Date(code.expiresAt).toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: '2-digit',
          })}
        </p>
      </div>
      <Button size="sm" variant="soft" onClick={onCopy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
