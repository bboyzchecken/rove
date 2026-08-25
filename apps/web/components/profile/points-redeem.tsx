'use client';

import { useState } from 'react';
import { Check, Copy, Gift, Ticket } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRedeemPoints, useRedemptions } from '@/features/rewards/queries';
import type { DiscountCode } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * แลกแต้มเป็นส่วนลด (M22 — A12.10).
 *
 * Redeeming burns the points immediately, so the card says what it costs
 * before the button and what it bought after it — a balance that silently
 * dropped is the single fastest way to lose trust in a points system.
 */
export function PointsRedeemCard() {
  const { data: board, isLoading } = useRedemptions();
  const redeem = useRedeemPoints();
  const [copied, setCopied] = useState('');

  if (isLoading) {
    return (
      <section className="px-4">
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
    <section className="px-4">
      <SectionHeader label="แลกแต้ม" />

      <Card className="p-4">
        <p className="text-espresso flex items-center gap-2 text-sm font-semibold">
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
              onClick={() => redeem.mutate(tier.amountThb)}
              className={cn(
                'rounded-brand p-3 text-center transition',
                tier.afford
                  ? 'bg-surface hover:bg-border'
                  : 'bg-surface cursor-not-allowed opacity-50',
              )}
            >
              <span className="text-espresso nums block text-sm font-extrabold">
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
    </section>
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
        <p className="text-espresso nums text-sm font-bold tracking-wide">{code.code}</p>
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
