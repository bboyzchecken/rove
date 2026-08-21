'use client';

import { ArrowRight, Check, EyeOff } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { ExpenseBoard } from '@/components/expense/expense-board';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useExpenses, useSettleUp } from '@/features/expense/queries';
import { useTrip, useTripMembers } from '@/features/trip/queries';
import { formatMoney, formatThaiDate } from '@/lib/format';

/**
 * Expense tab (M16) — actual money, kept strictly apart from the Budget tab's
 * estimate. Never included in any public payload (W16.5).
 */
export function ExpenseScreen({ tripId }: { tripId: string }) {
  const { data: summary, isLoading } = useExpenses(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const { data: trip } = useTrip(tripId);
  const settle = useSettleUp(tripId);

  if (isLoading || !summary) {
    return (
      <div className="space-y-3 pt-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-brand bg-surface h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '—';
  const characterOf = (id: string) => members.find((m) => m.id === id)?.characterId ?? 'shiba';

  return (
    <div className="space-y-7">
      <section>
        <SectionHeader label="ใช้ไปแล้วจริงๆ" />
        <Card accent="primary" className="p-5">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={formatMoney(summary.totalThb, 'THB')} label="รวมทั้งทริป" />
            <Stat value={formatMoney(summary.sharedTotalThb, 'THB')} label="ของกลาง" />
            <Stat value={formatMoney(summary.personalTotalThb, 'THB')} label="ส่วนตัวรวม" />
          </div>
          {trip?.fxAsOf ? (
            <p className="text-muted mt-3 text-[11px]">
              แปลงจากเยนด้วยอัตราโดยประมาณ ณ วันที่ {formatThaiDate(trip.fxAsOf)}
            </p>
          ) : null}
        </Card>
      </section>

      <section>
        <SectionHeader label="ใครจ่ายไปเท่าไหร่" />
        <Card className="divide-border divide-y">
          {summary.perMember.map((row) => (
            <div key={row.member.id} className="flex items-center gap-3 p-3.5">
              <CharacterAvatar characterId={row.member.characterId} size="md" />

              <div className="min-w-0 flex-1">
                <p className="text-espresso text-sm font-semibold">{row.member.name}</p>
                <p className="text-muted mt-0.5 text-[11px]">
                  จ่ายไป {formatMoney(row.paidThb, 'THB')} · ส่วนที่ต้องรับผิดชอบ{' '}
                  {formatMoney(row.shareThb, 'THB')}
                  {row.personalThb > 0
                    ? ` · ส่วนตัวอีก ${formatMoney(row.personalThb, 'THB')}`
                    : ''}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {row.balanceThb > 0 ? (
                  <>
                    <p className="text-success nums text-sm font-bold">
                      +{formatMoney(row.balanceThb, 'THB')}
                    </p>
                    <p className="text-muted text-[10px]">ควรได้คืน</p>
                  </>
                ) : row.balanceThb < 0 ? (
                  <>
                    <p className="text-primary nums text-sm font-bold">
                      {formatMoney(row.balanceThb, 'THB')}
                    </p>
                    <p className="text-muted text-[10px]">ต้องจ่ายคืน</p>
                  </>
                ) : (
                  <p className="text-muted text-xs">เท่าทุน</p>
                )}
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader label="น้องหารสรุปให้" />
        <Card accent="matcha" className="p-4">
          {summary.settlements.length === 0 ? (
            <p className="text-espresso text-sm">ตอนนี้ไม่มีใครติดใคร — เคลียร์กันหมดแล้ว 🎉</p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {summary.settlements.map((s) => (
                  <li
                    key={`${s.fromMemberId}-${s.toMemberId}`}
                    className="flex flex-wrap items-center gap-2.5"
                  >
                    <CharacterAvatar characterId={characterOf(s.fromMemberId)} size="sm" />
                    <span className="text-espresso text-sm font-semibold">
                      {nameOf(s.fromMemberId)}
                    </span>
                    <ArrowRight className="text-muted size-4" />
                    <CharacterAvatar characterId={characterOf(s.toMemberId)} size="sm" />
                    <span className="text-espresso text-sm font-semibold">
                      {nameOf(s.toMemberId)}
                    </span>
                    <span className="text-espresso nums ml-auto text-sm font-bold">
                      {formatMoney(s.amountThb, 'THB')}
                    </span>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={settle.isPending}
                      onClick={() =>
                        settle.mutate({
                          fromMemberId: s.fromMemberId,
                          toMemberId: s.toMemberId,
                        })
                      }
                    >
                      <Check className="size-3.5" /> จ่ายแล้ว
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-3 text-[11px]">
                โอนกัน {summary.settlements.length} ครั้งก็จบ — ไม่ต้องไล่จ่ายกันทีละบิล
              </p>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader label="รายการทั้งหมด" />
        <ExpenseBoard tripId={tripId} fxRate={trip?.fxRate ?? 0.235} />
      </section>

      <p className="text-muted flex items-start gap-1.5 text-[11px] leading-relaxed">
        <EyeOff className="mt-px size-3.5 shrink-0" />
        ค่าใช้จ่ายจะไม่ถูกแสดงในลิงก์แชร์หรือหน้าสาธารณะเสมอ ปิดสวิตช์นี้ไม่ได้
      </p>
    </div>
  );
}
