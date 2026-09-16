'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Paperclip } from 'lucide-react';

import { dayLabel, whenLabel } from '@/components/admin/admin-format';
import { KeyValueList, StatusPill } from '@/components/admin/ui/status-pill';
import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useMarkPayoutPaid, usePayoutCycle } from '@/features/admin/queries';
import type { AdminPayout } from '@/lib/data';
import { bankName } from '@/lib/catalog/banks';
import { formatMoney } from '@/lib/format';

/** One closed cycle: every transfer owed, with the full account to send it to. */
export function PayoutCycleScreen({ cycleId }: { cycleId: string }) {
  const { data, isLoading, error } = usePayoutCycle(cycleId);

  return (
    <div className="space-y-6">
      <Link
        href={'/admin/payouts' as never}
        className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-medium"
      >
        <ArrowLeft className="size-3.5" /> จ่ายครีเอเตอร์
      </Link>

      {isLoading ? (
        <div className="rounded-brand bg-surface h-32 animate-pulse" />
      ) : !data ? (
        <p className="text-danger text-sm">{error?.message ?? 'โหลดไม่สำเร็จ'}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-ink text-2xl font-medium tracking-tight">
              รอบปิดยอด {dayLabel(data.cycle.cutoffDate)}
            </h1>
            {data.cycle.overdue ? <StatusPill tone="danger">เลยกำหนดโอน</StatusPill> : null}
          </div>
          <p className="text-muted -mt-4 text-sm">
            โอนภายใน {dayLabel(data.cycle.dueDate)} · โอนแล้ว {data.cycle.paidCount}/{data.cycle.payoutCount} ·
            รวม {formatMoney(data.cycle.totalThb, 'THB')}
          </p>

          <section>
            <SectionHeader label="รายการโอน" />
            {data.payouts.length === 0 ? (
              <div className="rounded-brand bg-surface text-muted p-8 text-center text-sm">
                รอบนี้ไม่มีใครเข้าเงื่อนไขรับโอน
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.payouts.map((payout) => (
                  <PayoutCard key={payout.id} payout={payout} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PayoutCard({ payout }: { payout: AdminPayout }) {
  const markPaid = useMarkPayoutPaid();
  const [ref, setRef] = useState('');
  const [slip, setSlip] = useState<File | null>(null);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ink font-medium">
            {payout.name} {payout.handle ? <span className="text-muted text-xs">@{payout.handle}</span> : null}
          </p>
          <p className="text-muted text-xs">{payout.earningCount} รายการ</p>
        </div>
        <div className="text-right">
          <p className="text-ink nums text-lg font-medium">{formatMoney(payout.amountThb, 'THB')}</p>
          {payout.status === 'paid' ? (
            <StatusPill tone="ok">โอนแล้ว</StatusPill>
          ) : (
            <StatusPill tone="wait">รอโอน</StatusPill>
          )}
        </div>
      </div>

      <KeyValueList
        items={[
          {
            label: 'โอนเข้า',
            value: payout.accountKind === 'promptpay' ? 'พร้อมเพย์' : bankName(payout.bankCode),
          },
          {
            label: 'เลขบัญชี',
            value: payout.accountNumber || `••${payout.accountLast4}`,
          },
          { label: 'ชื่อบัญชี', value: payout.accountName },
          ...(payout.status === 'paid'
            ? [
                { label: 'เลขอ้างอิง', value: payout.transferRef },
                { label: 'โอนเมื่อ', value: payout.paidAt ? whenLabel(payout.paidAt) : '—' },
              ]
            : []),
        ]}
      />

      {payout.slipUrl ? (
        <a
          href={payout.slipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
        >
          <Paperclip className="size-3.5" /> ดูสลิป
        </a>
      ) : null}

      {payout.status === 'pending' ? (
        <form
          className="border-border space-y-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            markPaid.mutate({ payoutId: payout.id, transferRef: ref.trim(), slip: slip ?? undefined });
          }}
        >
          <p className="text-ink text-sm font-medium">บันทึกการโอน</p>
          <Field label="เลขอ้างอิงการโอน (บังคับ)">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Field label="สลิป (รูปหรือ PDF ไม่บังคับ)">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="text-muted block text-xs"
              onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
            />
          </Field>
          {markPaid.error ? <p className="text-danger text-xs">{markPaid.error.message}</p> : null}
          <Button type="submit" size="sm" disabled={!ref.trim() || markPaid.isPending}>
            {markPaid.isPending ? 'กำลังบันทึก…' : 'บันทึกว่าโอนแล้ว'}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
