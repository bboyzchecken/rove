'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, ReceiptText, Sparkles, Wallet } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { SectionHeader, Stat } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useBillingSummary, useOrders, useSubscriptionPlans } from '@/features/billing/queries';
import { track } from '@/lib/analytics';
import {
  groupOrdersByYear,
  ORDER_KIND_LABEL,
  ORDER_STATUS,
  orderAmountLabel,
  planPriceLabel,
  subscriptionStatusLine,
} from '@/lib/billing';
import type { Order, SubscriptionPlan } from '@/lib/data';
import { formatMoney, formatThaiDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * บิลและการชำระเงิน (M20).
 *
 * Three questions, in the order people ask them: what am I on, what have I
 * bought, and where is the receipt. The plan card sits first even though nobody
 * is on a paid plan yet — it is the answer to "am I being charged monthly?",
 * and that answer has to be readable without scrolling.
 *
 * Nothing here can be bought. A purchase happens where the thing being sold is
 * (the AI dialog today, a plan checkout later); this screen is the record.
 */
export function BillingScreen() {
  const { data: summary } = useBillingSummary();
  const { data: orders = [], isLoading } = useOrders();
  const { data: plans = [] } = useSubscriptionPlans();

  const subscription = summary?.subscription;
  const years = groupOrdersByYear(orders);
  const upcoming = plans.filter((plan) => !plan.available);

  useEffect(() => {
    if (summary) track('billing_viewed', { orders: summary.orders });
  }, [summary]);

  return (
    <div className="space-y-7 px-4 py-5">
      <header>
        <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
          บิลและการชำระเงิน
        </h1>
        <p className="text-muted mt-1 text-sm">ทุกอย่างที่คุณจ่ายให้ ROVE พร้อมใบเสร็จย้อนหลัง</p>
      </header>

      {/* plan ----------------------------------------------------------- */}
      <section>
        <SectionHeader label="แพ็กเกจปัจจุบัน" />
        <Card accent="primary" className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-ink text-lg font-bold">
                {subscription?.planName ?? 'ROVE ฟรี'}
              </p>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                {subscription ? subscriptionStatusLine(subscription) : '—'}
              </p>
            </div>
            <Badge tone={subscription?.status === 'active' ? 'green' : 'outline'} size="md">
              {subscription?.status === 'active' ? 'กำลังใช้งาน' : 'ไม่มีค่ารายเดือน'}
            </Badge>
          </div>
        </Card>

        <div className="mt-2.5 space-y-2">
          {upcoming.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
          {/* The pass is bought inside a trip, never here (A26.2): a pass with
              no trip attached is not a thing that can exist. So this screen
              points at the price list and stops. */}
          <p className="text-muted/80 px-1 text-[11px] leading-relaxed">
            ไม่มีค่าใช้จ่ายรายเดือนและไม่มีการตัดเงินอัตโนมัติ · ปลดล็อกเป็นทริป ๆ ไปจากในห้องทริปนั้น
            —{' '}
            <Link href="/pricing" className="text-primary font-medium">
              ดูราคาทั้งหมด
            </Link>
          </p>
        </div>
      </section>

      {/* summary -------------------------------------------------------- */}
      <section>
        <SectionHeader label="สรุปการใช้จ่าย" />
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat
              value={summary?.aiDraftsPurchased ?? 0}
              label="ซื้อสิทธิ์ AI ไปแล้ว"
              hint="ครั้ง (รวมทุกทริป)"
            />
            <Stat value={summary?.orders ?? 0} label="ใบเสร็จทั้งหมด" />
            <Stat value={formatMoney(summary?.totalSpentThb ?? 0, 'THB')} label="จ่ายเป็นเงินสด" />
            <Stat
              value={(summary?.pointsSpent ?? 0).toLocaleString('th-TH')}
              label="ใช้แต้มไป"
              hint="แต้ม ROVE"
            />
          </div>
          {summary?.since ? (
            <p className="text-muted/80 mt-4 text-[11px]">
              นับตั้งแต่ครั้งแรกที่ซื้อ · {formatThaiDate(summary.since)}
            </p>
          ) : null}
        </Card>
      </section>

      {/* history -------------------------------------------------------- */}
      <section>
        <SectionHeader label="ประวัติการซื้อ" />

        {isLoading ? (
          <Card className="text-muted p-5 text-sm">กำลังโหลด…</Card>
        ) : orders.length === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState
              image="/brand/empty/empty-expense.webp"
              title="ยังไม่เคยซื้ออะไรเลย"
              hint="ทุกทริปร่างด้วย AI ได้ฟรีอยู่แล้ว ถ้าซื้อสิทธิ์เพิ่มเมื่อไหร่ ใบเสร็จจะมาอยู่ตรงนี้"
              action={
                <ButtonLink href="/trips" size="sm" variant="ink">
                  ไปที่ทริปของฉัน
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {years.map((group) => (
              <div key={group.year}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <p className="text-ink text-sm font-bold">{group.year}</p>
                  <p className="text-muted nums text-[11px]">
                    รวม {formatMoney(group.totalThb, 'THB')}
                  </p>
                </div>
                <Card className="divide-border divide-y overflow-hidden">
                  {group.orders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="text-muted/70 pb-2 text-center text-[11px] leading-relaxed">
        <p>ใบเสร็จทุกใบเก็บไว้ถาวร เปิดดูหรือสั่งพิมพ์ได้ตลอด</p>
        <p className="mt-0.5">มีคำถามเรื่องบิล ทักมาพร้อมเลขที่ใบเสร็จได้เลย</p>
      </footer>
    </div>
  );
}

/** One line of history. The whole row is the link — this is a phone screen. */
function OrderRow({ order }: { order: Order }) {
  const status = ORDER_STATUS[order.status];

  return (
    <Link
      href={`/billing/${order.id}`}
      className="hover:bg-border/40 flex w-full items-center gap-3 px-4 py-3.5 text-left transition"
      aria-label={`ใบเสร็จ ${order.number}`}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          order.method === 'points' ? 'bg-yellow/55' : 'bg-surface',
        )}
        aria-hidden="true"
      >
        {order.kind === 'ai_credit' ? (
          <Sparkles className="text-ink size-4" strokeWidth={2.5} />
        ) : order.method === 'points' ? (
          <Wallet className="text-ink size-4" strokeWidth={2.5} />
        ) : (
          <ReceiptText className="text-ink size-4" strokeWidth={2.5} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm font-medium">{order.title}</span>
        <span className="text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]">
          <span className="nums">{formatThaiDate(order.issuedAt)}</span>
          <span aria-hidden="true">·</span>
          <span className="nums">{order.number}</span>
          {order.status !== 'paid' ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="text-ink nums block text-sm font-bold">
          {orderAmountLabel(order)}
        </span>
        <span className="text-muted text-[11px]">{ORDER_KIND_LABEL[order.kind]}</span>
      </span>

      <ChevronRight className="text-muted/60 size-4 shrink-0" />
    </Link>
  );
}

/**
 * A plan that is not on sale yet. It says so on the row rather than behind a
 * disabled button: a price tag with nothing to press is a promise, and it
 * should read like one.
 *
 * Only ROVE Year lands here now. Free needs no row, and the Trip Pass is bought
 * where the trip is — this screen is the record of what was paid, not a till.
 */
function PlanRow({ plan }: { plan: SubscriptionPlan }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-sm font-bold">{plan.name}</p>
          <p className="text-muted mt-0.5 text-xs leading-relaxed">{plan.tagline}</p>
          <ul className="text-muted mt-2 space-y-1 text-[11px]">
            {plan.perks.map((perk) => (
              <li key={perk} className="flex gap-1.5">
                <span aria-hidden="true">·</span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-ink nums text-sm font-bold">{planPriceLabel(plan)}</p>
          <Badge tone="outline" className="mt-1.5">
            เร็ว ๆ นี้
          </Badge>
        </div>
      </div>
    </Card>
  );
}
