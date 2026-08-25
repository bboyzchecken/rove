'use client';

import { Info, TrendingUp } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { useEarnings } from '@/features/rewards/queries';
import { formatMoney } from '@/lib/format';

/**
 * รายได้จากแพลนสาธารณะ (M22 — A12.11).
 *
 * Points are a score; this is money. The two are shown apart on purpose, and
 * this card never rounds a pending accrual up into a promise: an estimate says
 * so, and a balance under the minimum transfer says that too.
 */
export function CreatorEarningsCard() {
  const { data: statement, isLoading } = useEarnings();

  if (isLoading) {
    return (
      <section className="px-4">
        <SectionHeader label="รายได้จากแพลนสาธารณะ" />
        <div className="rounded-brand bg-surface h-32 animate-pulse" />
      </section>
    );
  }
  // Nothing earned yet is not an empty state worth a card — the creator page
  // already invites people to publish.
  if (!statement || statement.totals.count === 0) return null;

  const { totals } = statement;
  const belowMinimum = totals.payableThb > 0 && totals.payableThb < statement.minimumPayoutThb;

  return (
    <section className="px-4">
      <SectionHeader label="รายได้จากแพลนสาธารณะ" />

      <Card accent="matcha" className="p-4">
        <p className="text-espresso flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4" />
          ส่วนแบ่ง {statement.sharePercent}% จากค่าคอมที่พาร์ตเนอร์จ่าย
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Figure label="รอยืนยัน" amount={totals.pendingThb} />
          <Figure label="รอโอน" amount={totals.payableThb} />
          <Figure label="โอนแล้ว" amount={totals.paidThb} />
        </div>

        {belowMinimum ? (
          <p className="text-muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
            <Info className="mt-px size-3.5 shrink-0" />
            ยอดรอโอนยังไม่ถึงขั้นต่ำ {formatMoney(statement.minimumPayoutThb, 'THB')} — ทบไปเดือนถัดไป
          </p>
        ) : null}
      </Card>

      <Card className="divide-border mt-3 divide-y">
        {statement.entries.slice(0, 8).map((entry, i) => (
          <div key={`${entry.occurredAt}-${i}`} className="flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-espresso text-sm font-semibold">{entry.partner}</p>
              <p className="text-muted text-[11px]">
                {new Date(entry.occurredAt).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · ค่าคอม {formatMoney(entry.commissionThb, 'THB')}
                {entry.estimated ? ' (ประมาณการ)' : ''}
              </p>
            </div>
            <span className="text-espresso nums shrink-0 text-sm font-bold">
              {formatMoney(entry.amountThb, 'THB')}
            </span>
          </div>
        ))}
      </Card>

      {statement.payouts.length > 0 ? (
        <p className="text-muted mt-2 text-[11px]">
          โอนล่าสุด {formatMoney(statement.payouts[0]?.amountThb ?? 0, 'THB')} ·{' '}
          {statement.payouts[0]?.periodStart} ถึง {statement.payouts[0]?.periodEnd}
        </p>
      ) : null}
    </section>
  );
}

function Figure({ label, amount }: { label: string; amount: number }) {
  return (
    <div>
      <p className="text-muted text-[11px]">{label}</p>
      <p className="text-espresso nums text-base font-extrabold">{formatMoney(amount, 'THB')}</p>
    </div>
  );
}
