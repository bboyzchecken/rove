'use client';

import { Sparkles } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AI_CREDITS } from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * The entry point for "ให้ AI ร่างแพลนใหม่" (M4 — W4.1) and the meter for it.
 *
 * It is a block of its own rather than one more pill in the day toolbar
 * because two facts have to be readable before the tap, not after it: how many
 * free drafts are left, and what the next one costs. A quota you only discover
 * by pressing the button is a bad surprise attached to a paid action.
 */
export function AiCreditPanel({
  runsUsed,
  points,
  onStart,
}: {
  runsUsed: number;
  points: number;
  onStart: () => void;
}) {
  const freeLeft = Math.max(0, AI_CREDITS.freePerTrip - runsUsed);
  const draftsFromPoints = Math.floor(points / AI_CREDITS.pointsPerRun);

  return (
    <Card accent={freeLeft > 0 ? 'matcha' : 'sun'} className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RoveMark className="text-primary size-4 shrink-0" />
            <p className="font-display text-espresso font-bold">ให้ AI ร่างแพลนใหม่</p>
          </div>

          <p className="text-muted mt-1 text-sm leading-relaxed">
            {freeLeft > 0
              ? `ทริปนี้ยังร่างฟรีได้อีก ${freeLeft} ครั้ง จากทั้งหมด ${AI_CREDITS.freePerTrip} ครั้ง`
              : `ใช้สิทธิ์ฟรีครบ ${AI_CREDITS.freePerTrip} ครั้งแล้ว — ร่างต่อได้ด้วยแต้มหรือจ่ายเงิน`}
          </p>

          {/* One dot per free draft, filled once it is spent. */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: AI_CREDITS.freePerTrip }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'size-2.5 rounded-full',
                    // Spent credits read as empty, remaining ones as filled.
                    i < runsUsed ? 'border-muted/40 border-2' : 'bg-primary',
                  )}
                />
              ))}
            </span>
            <span className="text-muted nums text-[11px]">
              ใช้ไปแล้ว {Math.min(runsUsed, AI_CREDITS.freePerTrip)}/{AI_CREDITS.freePerTrip}
            </span>
          </div>
        </div>

        <div className="shrink-0 sm:text-right">
          <Button size="lg" onClick={onStart} className="w-full sm:w-auto">
            <Sparkles className="size-4" />
            {freeLeft > 0 ? 'ร่างใหม่ ใช้สิทธิ์ฟรี' : 'ร่างใหม่ เลือกวิธีจ่าย'}
          </Button>

          <p className="text-muted mt-2 text-[11px] leading-relaxed">
            {freeLeft > 0 ? (
              <>
                ครั้งถัดไปหลังใช้สิทธิ์ฟรีหมด{' '}
                <span className="nums">{AI_CREDITS.pointsPerRun}</span> แต้ม หรือ{' '}
                <span className="nums">฿{AI_CREDITS.priceThb}</span>
              </>
            ) : (
              <>
                มี <span className="nums">{points.toLocaleString('th-TH')}</span> แต้ม
                {draftsFromPoints > 0 ? ` — แลกร่างได้อีก ${draftsFromPoints} ครั้ง` : null}
              </>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
