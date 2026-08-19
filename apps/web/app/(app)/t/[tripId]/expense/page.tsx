import { ArrowRight, EyeOff } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { ExpenseBoard } from '@/components/expense/expense-board';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { expenseSummary, MEMBERS, memberName, TRIP } from '@/lib/mock';

/**
 * Expense tab (M16) — actual money, kept strictly apart from the Budget tab's
 * estimate. Never included in any public payload (W16.5).
 */
export const metadata = { title: 'ค่าใช้จ่ายจริง' };

export default function ExpensePage() {
  return (
    <div className="space-y-7">
      <section>
        <SectionHeader label="ใช้ไปแล้วจริงๆ" />
        <Card accent="primary" className="p-5">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={formatMoney(expenseSummary.totalThb, 'THB')} label="รวมทั้งทริป" />
            <Stat value={formatMoney(expenseSummary.sharedTotalThb, 'THB')} label="ของกลาง" />
            <Stat value={formatMoney(expenseSummary.personalTotalThb, 'THB')} label="ส่วนตัวรวม" />
          </div>
          <p className="text-muted mt-3 text-[11px]">
            แปลงจากเยนด้วยอัตราโดยประมาณ ณ วันที่ {formatThaiDate(TRIP.fxAsOf)}
          </p>
        </Card>
      </section>

      <section>
        <SectionHeader label="ใครจ่ายไปเท่าไหร่" />
        <Card className="divide-border divide-y">
          {expenseSummary.perMember.map((row) => (
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
          <ul className="space-y-2.5">
            {expenseSummary.settlements.map((s, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <CharacterAvatar
                  characterId={MEMBERS.find((m) => m.id === s.fromMemberId)!.characterId}
                  size="sm"
                />
                <span className="text-espresso text-sm font-semibold">
                  {memberName(s.fromMemberId)}
                </span>
                <ArrowRight className="text-muted size-4" />
                <CharacterAvatar
                  characterId={MEMBERS.find((m) => m.id === s.toMemberId)!.characterId}
                  size="sm"
                />
                <span className="text-espresso text-sm font-semibold">
                  {memberName(s.toMemberId)}
                </span>
                <span className="text-espresso nums ml-auto text-sm font-bold">
                  {formatMoney(s.amountThb, 'THB')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 text-[11px]">
            โอนกัน {expenseSummary.settlements.length} ครั้งก็จบ — ไม่ต้องไล่จ่ายกันทีละบิล
          </p>
        </Card>
      </section>

      <section>
        <SectionHeader label="รายการทั้งหมด" />
        <ExpenseBoard />
      </section>

      <p className="text-muted flex items-start gap-1.5 text-[11px] leading-relaxed">
        <EyeOff className="mt-px size-3.5 shrink-0" />
        ค่าใช้จ่ายจะไม่ถูกแสดงในลิงก์แชร์หรือหน้าสาธารณะเสมอ ปิดสวิตช์นี้ไม่ได้
      </p>
    </div>
  );
}
