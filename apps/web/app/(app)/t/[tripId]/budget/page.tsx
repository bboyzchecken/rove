'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Info } from 'lucide-react';

import { usePlanBudget } from '@/features/budget/queries';
import { usePlan, usePlans } from '@/features/plan/queries';
import { useTripOverview } from '@/features/trip/queries';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';

/**
 * M7 — the Budget tab.
 *
 * Everything here says "ประมาณการ" because it is: an estimate derived from the
 * items in the plan, not money anyone has spent. Real spending is a different
 * tab on purpose (M16), and the two numbers are never added together.
 */

const CATEGORY_LABELS: Record<string, string> = {
  stay: 'ที่พัก',
  transport: 'เดินทาง',
  ticket: 'ค่าเข้า/ตั๋ว',
  food: 'อาหาร',
  shopping: 'ช้อปปิ้ง',
  other: 'อื่น ๆ',
};

const CATEGORY_ORDER = ['stay', 'transport', 'ticket', 'food', 'shopping', 'other'];

export default function BudgetPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);

  const { data: overview } = useTripOverview(tripId);
  const { data: plans, isLoading: plansLoading } = usePlans(tripId);
  const activePlan = plans?.items.find((p) => p.is_final) ?? plans?.items[0];

  const { data: budget, isLoading, error, refetch } = usePlanBudget(activePlan?.id);
  const { data: plan } = usePlan(activePlan?.id);

  useEffect(() => {
    track({ name: 'budget_viewed' });
  }, []);

  if (plansLoading || isLoading) return <SkeletonList rows={3} />;

  if (!activePlan) {
    return (
      <EmptyState
        title="ยังไม่มีแพลนให้คิดงบ"
        description="งบประมาณคำนวณจากรายการในแพลน — สร้างแพลนก่อนแล้วตัวเลขจะขึ้นเอง"
        action={
          <Link
            href={`/t/${tripId}/plan`}
            className="rounded-brand bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
          >
            ไปหน้าแพลน
          </Link>
        }
      />
    );
  }

  if (error || !budget) return <ErrorState onRetry={() => void refetch()} />;

  const itemsMissing = new Set(budget.items_missing_cost);
  const missingItems =
    plan?.days.flatMap((day) => day.items.filter((item) => itemsMissing.has(item.id))) ?? [];

  const overBudget =
    budget.budget_max !== null && budget.per_person > budget.budget_max;

  return (
    <div className="space-y-4">
      <Card tone="primary">
        <CardHeader>
          <div>
            <CardTitle>งบประมาณทั้งทริป</CardTitle>
            <CardDescription>{budget.estimate_label}</CardDescription>
          </div>
          <Badge tone="neutral">ประมาณการ</Badge>
        </CardHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="รวมทั้งกลุ่ม" value={formatMoney(budget.total, budget.currency)} big />
          <Stat
            label={`ต่อคน (${budget.party_size} คน)`}
            value={formatMoney(budget.per_person, budget.currency)}
            big
          />
          <Stat label="จ่ายไปแล้ว" value={formatMoney(budget.prepaid_total, budget.currency)} />
          <Stat
            label="ยังต้องจ่ายอีก"
            value={formatMoney(budget.remaining_total, budget.currency)}
          />
        </div>

        {/* W7.3 — the FX label is required wherever converted money appears. */}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {budget.fx_rate_note}
          {budget.fx_rate > 0
            ? ` · 1 ${budget.source_currency} ≈ ${budget.fx_rate.toFixed(4)} ${budget.currency}`
            : ''}
        </p>

        {overBudget ? (
          <p className="mt-2 rounded-brand bg-sun/40 px-3 py-2 text-sm text-espresso">
            เกินงบที่ตั้งไว้ ({formatMoney(budget.budget_max, budget.currency)}/คน) อยู่{' '}
            {formatMoney(budget.per_person - budget.budget_max!, budget.currency)}
          </p>
        ) : budget.budget_max !== null ? (
          <p className="mt-2 text-sm text-matcha">
            ยังอยู่ในงบที่ตั้งไว้ ({formatMoney(budget.budget_max, budget.currency)}/คน)
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>แยกตามหมวด</CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 font-medium">หมวด</th>
                <th className="pb-2 text-right font-medium">รวม ({budget.currency})</th>
                <th className="pb-2 text-right font-medium">ต่อคน</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.filter((key) => budget.by_category[key]).map((key) => {
                const amount = budget.by_category[key]!;
                return (
                  <tr key={key} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 text-espresso">{CATEGORY_LABELS[key] ?? key}</td>
                    <td className="py-2.5 text-right font-medium text-espresso">
                      {formatMoney(amount, budget.currency)}
                    </td>
                    <td className="py-2.5 text-right text-muted">
                      {formatMoney(amount / budget.party_size, budget.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-espresso/20 font-medium">
                <td className="pt-2.5 text-espresso">รวม</td>
                <td className="pt-2.5 text-right text-espresso">
                  {formatMoney(budget.total, budget.currency)}
                </td>
                <td className="pt-2.5 text-right text-espresso">
                  {formatMoney(budget.per_person, budget.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* W7.2 — an item with no price is why a total looks too good. */}
      {missingItems.length > 0 ? (
        <Card tone="sun">
          <CardHeader>
            <div>
              <CardTitle>ยังไม่ได้ใส่ราคา {missingItems.length} รายการ</CardTitle>
              <CardDescription>
                ยอดข้างบนยังไม่รวมรายการเหล่านี้ ใส่ราคาแล้วตัวเลขจะตรงขึ้น
              </CardDescription>
            </div>
            <AlertCircle className="h-5 w-5 shrink-0 text-espresso/60" />
          </CardHeader>
          <ul className="space-y-1">
            {missingItems.slice(0, 8).map((item) => (
              <li key={item.id} className="text-sm text-espresso/80">
                •{' '}
                <Link href={`/t/${tripId}/plan#item-${item.id}`} className="hover:underline">
                  {item.title}
                </Link>
              </li>
            ))}
            {missingItems.length > 8 ? (
              <li className="text-sm text-espresso/60">และอีก {missingItems.length - 8} รายการ</li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted">
        ตัวเลขนี้คือประมาณการจากแพลน ไม่ใช่เงินที่ใช้ไปจริง —{' '}
        <Link href={`/t/${tripId}/expense`} className="text-primary hover:underline">
          ดูรายจ่ายจริง
        </Link>
        {overview ? ` (${overview.counts.members} คนในทริป)` : ''}
      </p>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          big ? 'font-display text-xl font-bold text-espresso' : 'font-display text-base text-espresso'
        }
      >
        {value}
      </p>
    </div>
  );
}
