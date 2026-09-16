'use client';

import Link from 'next/link';
import { CalendarClock, ChevronRight, Info, TrendingUp } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { useEarnings } from '@/features/rewards/queries';
import { accountLabel } from '@/lib/catalog/banks';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { cn } from '@/lib/utils';

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
      <section>
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
  const short = (iso: string) => formatThaiDate(iso, { year: undefined });

  return (
    <section>
      <SectionHeader label="รายได้จากแพลนสาธารณะ" />

      <Card accent="gray" className="p-4">
        <p className="text-ink flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="size-4" />
          ส่วนแบ่ง {statement.sharePercent}% จากค่าคอมที่พาร์ตเนอร์จ่าย
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Figure label="รอพาร์ตเนอร์จ่าย" amount={totals.pendingThb} />
          <Figure label="รอโอน" amount={totals.payableThb} />
          <Figure label="โอนแล้ว" amount={totals.paidThb} />
        </div>
        {totals.inPayoutThb > 0 || totals.expiredThb > 0 ? (
          <p className="text-muted nums mt-2 text-center text-[11px]">
            {totals.inPayoutThb > 0 ? `อยู่ในรอบโอน ${formatMoney(totals.inPayoutThb, 'THB')}` : ''}
            {totals.inPayoutThb > 0 && totals.expiredThb > 0 ? ' · ' : ''}
            {totals.expiredThb > 0 ? `หมดอายุ ${formatMoney(totals.expiredThb, 'THB')}` : ''}
          </p>
        ) : null}

        {/* D-21: when the next transfer goes out. */}
        {statement.nextCycle && statement.verified ? (
          <p className="text-ink mt-3 flex items-start gap-1.5 text-xs">
            <CalendarClock className="mt-px size-3.5 shrink-0" />
            <span className="nums">
              รอบถัดไป {formatThaiDate(statement.nextCycle.cutoffDate, { year: undefined, weekday: 'short' })} ·
              โอนภายใน {short(statement.nextCycle.dueDate)}
            </span>
          </p>
        ) : null}

        {/* D-35: income waiting on verification, and when it runs out. */}
        {statement.held ? (
          <div className="bg-orange-light rounded-brand-sm mt-3 p-3">
            <p className="text-ink nums text-xs font-medium">
              รายได้ {formatMoney(statement.held.amountThb, 'THB')} รอยืนยันตัวตน · หมดอายุ{' '}
              {formatThaiDate(statement.held.earliestExpiry)}
            </p>
            <Link
              href={'/profile/verify' as never}
              className="text-ink mt-1 inline-flex items-center gap-1 text-[11px] font-medium underline-offset-2 hover:underline"
            >
              ยืนยันตัวตนเพื่อรับรายได้ <ChevronRight className="size-3" />
            </Link>
          </div>
        ) : null}

        {belowMinimum && statement.verified ? (
          <p className="text-muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
            <Info className="mt-px size-3.5 shrink-0" />
            ยอดรอโอนยังไม่ถึงขั้นต่ำ {formatMoney(statement.minimumPayoutThb, 'THB')} — ทบไปรอบถัดไป
          </p>
        ) : null}
      </Card>

      <Card className="divide-border mt-3 divide-y">
        {statement.entries.slice(0, 8).map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-medium">{entry.partner}</p>
              <p className="text-muted text-[11px]">
                {short(entry.occurredAt)} · {EARNING_STATUS[entry.status] ?? entry.status}
                {entry.estimated ? ' · ประมาณการ' : ''}
                {entry.expiresAt ? ` · หมดอายุ ${short(entry.expiresAt)}` : ''}
              </p>
            </div>
            <span
              className={cn(
                'nums shrink-0 text-sm font-medium',
                entry.status === 'reversed' || entry.status === 'expired'
                  ? 'text-muted line-through'
                  : 'text-ink',
              )}
            >
              {formatMoney(entry.amountThb, 'THB')}
            </span>
          </div>
        ))}
      </Card>

      {statement.payouts.length > 0 ? (
        <>
          <p className="section-label mt-4 mb-2">ประวัติการโอน</p>
          <Card className="divide-border divide-y">
            {statement.payouts.map((payout) => (
              <div key={payout.id} className="flex items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-ink text-sm font-medium">
                    {payout.status === 'paid' && payout.paidAt
                      ? `โอนแล้ว ${short(payout.paidAt)}`
                      : payout.dueDate
                        ? `รอโอน · ภายใน ${short(payout.dueDate)}`
                        : 'รอโอน'}
                  </p>
                  <p className="text-muted nums text-[11px]">
                    {[
                      payout.accountLast4
                        ? accountLabel(payout.bankCode ? 'bank' : 'promptpay', payout.bankCode, payout.accountLast4)
                        : '',
                      payout.transferRef ? `อ้างอิง ${payout.transferRef}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || `${short(payout.periodStart)} – ${short(payout.periodEnd)}`}
                  </p>
                  {payout.slipUrl ? (
                    <a
                      href={payout.slipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink mt-0.5 inline-block text-[11px] font-medium underline underline-offset-2"
                    >
                      ดูสลิป
                    </a>
                  ) : null}
                </div>
                <span className="text-ink nums shrink-0 text-sm font-medium">
                  {formatMoney(payout.amountThb, 'THB')}
                </span>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </section>
  );
}

const EARNING_STATUS: Record<string, string> = {
  pending: 'รอพาร์ตเนอร์จ่าย',
  payable: 'รอโอน',
  in_payout: 'อยู่ในรอบโอน',
  paid: 'โอนแล้ว',
  reversed: 'กลับรายการ',
  expired: 'หมดอายุ',
};

function Figure({ label, amount }: { label: string; amount: number }) {
  return (
    <div>
      <p className="text-muted text-[11px]">{label}</p>
      <p className="text-ink nums text-base font-medium">{formatMoney(amount, 'THB')}</p>
    </div>
  );
}
