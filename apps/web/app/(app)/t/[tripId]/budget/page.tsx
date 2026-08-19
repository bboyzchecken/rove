import { Info, TriangleAlert } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { BUDGET, budgetTotals, ITEMS_WITHOUT_COST, jpyToThb, TRIP } from '@/lib/mock';

/**
 * Budget tab (M7 — W7.1 … W7.3).
 *
 * Everything here is an ESTIMATE derived from plan items. Actual money spent
 * lives in the Expense tab (M16) and the two are never mixed, because
 * conflating them is how group budgets go wrong.
 */
export const metadata = { title: 'งบประมาณการ' };

export default function BudgetPage() {
  const overBudget = budgetTotals.remainingThb < 0;

  return (
    <div className="space-y-7">
      <section>
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="section-label">งบต่อคน</h2>
          <Badge tone="outline">ประมาณการ</Badge>
        </div>

        <Card accent="primary" className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-espresso text-3xl font-extrabold tracking-tight">
                {formatMoney(budgetTotals.perPersonThb, 'THB')}
              </p>
              <p className="text-muted mt-1 text-xs">
                ¥{budgetTotals.perPersonJpy.toLocaleString('en-US')} ต่อคน · รวมทั้งกลุ่ม ¥
                {budgetTotals.totalJpy.toLocaleString('en-US')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-muted text-xs">งบที่ตั้งไว้</p>
              <p className="font-display text-espresso font-bold">
                {formatMoney(TRIP.budgetPerPersonThb, 'THB')}
              </p>
            </div>
          </div>

          <Progress
            value={budgetTotals.budgetUsed}
            tone={overBudget ? 'primary' : 'espresso'}
            className="mt-4"
          />
          <p className="text-muted mt-2 text-xs">
            {overBudget
              ? `เกินงบอยู่ ${formatMoney(Math.abs(budgetTotals.remainingThb), 'THB')}`
              : `ยังเหลืออีก ${formatMoney(budgetTotals.remainingThb, 'THB')} ต่อคน`}
          </p>
        </Card>
      </section>

      <section>
        <SectionHeader label="แยกตามหมวด" />
        <Card className="overflow-hidden">
          <div className="text-muted bg-surface grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[11px] font-semibold">
            <span>หมวด</span>
            <span className="w-24 text-right">รวมทั้งกลุ่ม</span>
            <span className="w-24 text-right">ต่อคน</span>
          </div>

          <div className="divide-border divide-y">
            {BUDGET.map((line) => (
              <div
                key={line.category}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span>{line.icon}</span>
                  <span className="text-espresso truncate text-sm font-medium">
                    {line.category}
                  </span>
                  {line.prepaid ? <Badge tone="joyfull">จ่ายแล้ว</Badge> : null}
                </div>
                <div className="w-24 text-right">
                  <p className="text-espresso nums text-xs">
                    ¥{line.totalJpy.toLocaleString('en-US')}
                  </p>
                </div>
                <div className="w-24 text-right">
                  <p className="text-espresso nums text-xs font-semibold">
                    {formatMoney(jpyToThb(line.perPersonJpy), 'THB')}
                  </p>
                  <p className="text-muted nums text-[10px]">
                    ¥{line.perPersonJpy.toLocaleString('en-US')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-espresso text-bg grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3">
            <span className="font-display text-sm font-bold">รวม</span>
            <span className="w-24 text-right nums text-xs">
              ¥{budgetTotals.totalJpy.toLocaleString('en-US')}
            </span>
            <span className="font-display w-24 text-right text-sm font-extrabold">
              {formatMoney(budgetTotals.perPersonThb, 'THB')}
            </span>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader label="ที่ควรรู้" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Card accent="joyfull" className="p-4">
            <Stat
              value={formatMoney(jpyToThb(budgetTotals.prepaidJpy / TRIP.partySize), 'THB')}
              label="จ่ายล่วงหน้าไปแล้ว (ที่พัก)"
              hint="ไม่ต้องเตรียมเงินสดส่วนนี้"
            />
          </Card>

          <Card accent="sun" className="p-4">
            <div className="flex items-start gap-2">
              <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-espresso text-sm font-semibold">
                  ยังมี {ITEMS_WITHOUT_COST} รายการที่ไม่ได้ใส่ราคา
                </p>
                <p className="text-muted mt-1 text-xs leading-relaxed">
                  ส่วนใหญ่เป็นเวลาว่างกับที่ที่เข้าฟรี แต่ตัวเลขจริงอาจขยับขึ้นได้อีก
                </p>
              </div>
            </div>
          </Card>
        </div>

        <p className="text-muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Info className="mt-px size-3.5 shrink-0" />
          แปลงค่าเงินด้วยอัตราโดยประมาณ 1 เยน = {TRIP.fxRate} บาท ณ วันที่{' '}
          {formatThaiDate(TRIP.fxAsOf)} — ตัวเลขจริงตอนรูดบัตรจะต่างจากนี้เล็กน้อย
        </p>
      </section>
    </div>
  );
}
