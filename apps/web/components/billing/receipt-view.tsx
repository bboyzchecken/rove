'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useMe } from '@/features/auth/queries';
import { useOrder } from '@/features/billing/queries';
import { track } from '@/lib/analytics';
import { ORDER_KIND_LABEL, ORDER_STATUS, PAYMENT_METHOD_LABEL } from '@/lib/billing';
import { env } from '@/lib/env';
import { formatMoney, formatThaiDate } from '@/lib/format';

/**
 * One receipt (M20 — W20.3).
 *
 * A receipt is a document, not a screen: it has a number, a date, a buyer, what
 * was sold, and what was actually taken. So this renders as a sheet of paper on
 * a white page and prints as itself — `print:` rules drop the chrome rather
 * than a second "printable version" being generated somewhere else, which is
 * how the printed copy and the screen copy start disagreeing.
 *
 * Two honesty rules it keeps:
 *  - an order paid with points shows the list price *and* the points, because
 *    ฿0 alone does not describe what happened;
 *  - while there is no gateway, a cash order says on its face that no money
 *    moved. A receipt that implies a charge that never happened is worse than
 *    no receipt.
 */
export function ReceiptView({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useOrder(orderId);
  const { data: me } = useMe();

  useEffect(() => {
    if (order) track('receipt_viewed', { kind: order.kind });
  }, [order]);

  if (isLoading) {
    return <p className="text-muted px-4 py-10 text-center text-sm">กำลังโหลดใบเสร็จ…</p>;
  }

  if (!order) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="font-display text-ink text-lg font-medium">ไม่พบใบเสร็จนี้</p>
        <p className="text-muted mt-1 text-sm">ลิงก์อาจเก่าไป หรือเป็นใบเสร็จของบัญชีอื่น</p>
        <ButtonLink href="/billing" size="sm" variant="ink" className="mt-4">
          กลับไปหน้าบิล
        </ButtonLink>
      </div>
    );
  }

  const status = ORDER_STATUS[order.status];
  const paidWithPoints = order.method === 'points';

  return (
    <div className="space-y-4 px-4 py-5">
      {/* chrome — never printed ---------------------------------------- */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/billing"
          className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <ArrowLeft className="size-4" />
          บิลและการชำระเงิน
        </Link>
        <Button size="sm" variant="soft" onClick={() => window.print()}>
          <Printer className="size-4" />
          พิมพ์ / บันทึก PDF
        </Button>
      </div>

      <Card className="border-border overflow-hidden border p-0 print:border-0">
        {/* head -------------------------------------------------------- */}
        <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b p-5">
          <div>
            <p className="font-display text-ink text-lg font-medium tracking-tight">
              {env.brandName}
            </p>
            <p className="text-muted mt-0.5 text-[11px]">ใบเสร็จรับเงิน / Receipt</p>
          </div>
          <div className="text-right">
            <p className="text-ink nums text-sm font-medium">{order.number}</p>
            <p className="text-muted nums mt-0.5 text-[11px]">
              ออกเมื่อ {formatThaiDate(order.issuedAt)}
            </p>
            <Badge tone={status.tone} className="mt-1.5">
              {status.label}
            </Badge>
          </div>
        </div>

        {/* buyer ------------------------------------------------------- */}
        <div className="border-border grid gap-4 border-b p-5 sm:grid-cols-2">
          <Field label="ผู้ซื้อ">
            <p className="text-ink text-sm font-medium">{me?.name ?? '—'}</p>
            {me?.email ? <p className="text-muted text-[11px]">{me.email}</p> : null}
            {me?.handle ? <p className="text-muted text-[11px]">{me.handle}</p> : null}
          </Field>
          <Field label="ชำระโดย">
            <p className="text-ink text-sm font-medium">
              {order.methodLabel || PAYMENT_METHOD_LABEL[order.method]}
            </p>
            {order.paidAt ? (
              <p className="text-muted nums text-[11px]">เมื่อ {formatThaiDate(order.paidAt)}</p>
            ) : null}
            {order.providerRef ? (
              <p className="text-muted nums text-[11px]">อ้างอิง {order.providerRef}</p>
            ) : null}
          </Field>
        </div>

        {/* lines ------------------------------------------------------- */}
        <div className="p-5">
          <p className="section-label mb-2.5">รายการ</p>

          <div className="space-y-2.5">
            {order.lines.map((line, index) => (
              <div
                key={`${line.label}-${index}`}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-ink text-sm">{line.label}</p>
                  <p className="text-muted nums text-[11px]">
                    {line.quantity} × {formatMoney(line.unitAmountThb, order.currency)}
                  </p>
                </div>
                <p className="text-ink nums shrink-0 text-sm">
                  {formatMoney(line.amountThb, order.currency)}
                </p>
              </div>
            ))}
          </div>

          <div className="border-border mt-4 space-y-1.5 border-t pt-4">
            <Row label="ยอดรวม" value={formatMoney(order.subtotalThb, order.currency)} />
            {order.discountThb > 0 ? (
              <Row
                label={paidWithPoints ? `ส่วนลดจากแต้ม ROVE` : 'ส่วนลด'}
                value={`- ${formatMoney(order.discountThb, order.currency)}`}
              />
            ) : null}
            <div className="flex items-baseline justify-between pt-1.5">
              <p className="text-ink text-sm font-medium">ยอดที่ชำระ</p>
              <p className="font-display text-ink nums text-xl font-medium">
                {formatMoney(order.totalThb, order.currency)}
              </p>
            </div>
            {order.pointsSpent > 0 ? (
              <p className="text-muted nums text-right text-[11px]">
                และใช้แต้ม ROVE {order.pointsSpent.toLocaleString('th-TH')} แต้ม
              </p>
            ) : null}
          </div>
        </div>

        {/* context ----------------------------------------------------- */}
        <div className="bg-surface space-y-1 px-5 py-4 text-[11px] print:bg-transparent">
          <p className="text-muted">
            ประเภท: <span className="text-ink">{ORDER_KIND_LABEL[order.kind]}</span>
          </p>
          {order.tripTitle ? (
            <p className="text-muted">
              ใช้กับทริป: <span className="text-ink">{order.tripTitle}</span>
            </p>
          ) : null}
          {order.periodStart && order.periodEnd ? (
            <p className="text-muted nums">
              รอบบิล: {formatThaiDate(order.periodStart)} – {formatThaiDate(order.periodEnd)}
            </p>
          ) : null}
          <p className="text-muted/80 nums">เลขที่อ้างอิงภายใน: {order.id}</p>
        </div>
      </Card>

      {order.simulated ? (
        <Card accent="yellow" className="p-4">
          <p className="text-ink text-xs leading-relaxed">
            รายการนี้ยังไม่มีการตัดเงินจริง — ROVE ยังไม่ได้เปิดระบบชำระเงิน
            บันทึกไว้เป็นประวัติเพื่อให้เห็นสิทธิ์ที่ได้รับเท่านั้น
          </p>
        </Card>
      ) : null}

      {/* `as never`: ButtonLink takes Link's own props and is not generic in its
          href, so a template literal needs the same cast the rest of the app
          uses for a dynamic route (components/trip/trip-overview.tsx). */}
      {order.tripId ? (
        <ButtonLink
          href={`/t/${order.tripId}` as never}
          variant="soft"
          size="sm"
          className="print:hidden"
        >
          เปิดทริปที่ใช้สิทธิ์นี้
        </ButtonLink>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-1">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <p className="text-muted text-xs">{label}</p>
      <p className="text-ink nums text-xs">{value}</p>
    </div>
  );
}
