'use client';

import { Sparkles } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAiCredits } from '@/features/ai/queries';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The entry point for "ให้ AI ร่างแพลนใหม่" (M4 — W4.1) and the meter for it.
 *
 * It is a block of its own rather than one more pill in the day toolbar
 * because two facts have to be readable before the tap, not after it: how many
 * free drafts are left, and what the next one costs. A quota you only discover
 * by pressing the button is a bad surprise attached to a paid action.
 *
 * Since M26 the second fact is a different sentence. It is not "the next draft
 * costs ฿39" — it is "unlock this trip, and get it back when you book". The
 * refund is on the card rather than in the terms, because it is the reason the
 * price is worth reading at all (W26.3).
 */
export function AiCreditPanel({ tripId, onStart }: { tripId: string; onStart: () => void }) {
  const { data: credits } = useAiCredits(tripId);

  const included = credits?.included ?? 0;
  const used = credits?.used ?? 0;
  const extra = credits?.extra ?? 0;
  const hasPass = credits?.hasPass ?? false;
  const freeLeft = Math.max(0, included - used);
  const passPrice = credits?.passPriceThb ?? 0;
  const perPerson = credits?.passPerPersonThb ?? passPrice;

  return (
    <Card accent={hasPass || freeLeft > 0 ? 'feature' : 'warning'} className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RoveMark className="text-primary size-4 shrink-0" />
            <p className="font-display text-ink font-medium">ให้ AI ร่างแพลนใหม่</p>
          </div>

          <p className="text-muted mt-1 text-sm leading-relaxed">
            {hasPass
              ? 'ทริปนี้ปลดล็อกแล้ว — ร่างและปรับแพลนได้ไม่จำกัด'
              : freeLeft > 0
                ? `ทริปนี้ยังร่างฟรีได้อีก ${freeLeft} ครั้ง จากทั้งหมด ${included} ครั้ง`
                : extra > 0
                  ? `ใช้สิทธิ์ฟรีครบแล้ว — เหลือสิทธิ์ที่ซื้อไว้ ${Math.max(0, included + extra - used)} ครั้ง`
                  : `ใช้สิทธิ์ฟรีครบ ${included} ครั้งแล้ว`}
          </p>

          {/* One dot per included draft, emptied once it is spent. Hidden under
              a pass: a countdown that cannot run out is a countdown that means
              nothing, and leaving it up would make the paid state look like the
              free one with extra steps. */}
          {hasPass ? null : (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="flex items-center gap-1" aria-hidden="true">
                {Array.from({ length: included }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-2.5 rounded-full',
                      i < used ? 'border-muted/40 border-2' : 'bg-primary',
                    )}
                  />
                ))}
              </span>
              <span className="text-muted nums text-[11px]">
                ใช้ไปแล้ว {Math.min(used, included)}/{included}
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0 sm:text-right">
          <Button size="lg" onClick={onStart} className="w-full sm:w-auto">
            <Sparkles className="size-4" />
            {hasPass
              ? 'ร่างใหม่'
              : freeLeft > 0
                ? 'ร่างใหม่ ใช้สิทธิ์ฟรี'
                : `ปลดล็อกทริปนี้ ${formatMoney(passPrice, 'THB')}`}
          </Button>

          <p className="text-muted mt-2 text-[11px] leading-relaxed">
            {hasPass ? (
              'จองผ่าน ROVE แล้วเราคืนค่า Trip Pass ให้เต็มจำนวน'
            ) : freeLeft > 0 ? (
              <>
                หลังใช้สิทธิ์ฟรีหมด ปลดล็อกทั้งทริป{' '}
                <span className="nums">{formatMoney(passPrice, 'THB')}</span> — ได้คืนเต็มจำนวนถ้าจองผ่าน ROVE
              </>
            ) : (
              <>
                หารกันในทริปแล้วคนละ <span className="nums">{formatMoney(perPerson, 'THB')}</span> ·
                จองผ่าน ROVE แล้วได้คืนเต็มจำนวน
              </>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
