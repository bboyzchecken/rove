'use client';

import Link from 'next/link';
import { ArrowRight, Check, Ticket } from 'lucide-react';

import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useCloseTrip } from '@/features/trip/queries';
import type { TripAllowance } from '@/lib/data';

/**
 * The paywall (Feedback #2 — D-10, F1.4).
 *
 * UAT round 1 hit the free tier's wall at the last step of the entry flow and
 * saw a grey box with a sentence in it: "กดต่อไม่ได้" (หน้า 6). The rule is
 * fine — one trip at a time is the whole free tier — but the wall has to say
 * what it is and show both doors through it:
 *
 *   1. finish (close) a trip that is holding the slot — free, one tap per row
 *   2. buy a Trip Pass — ฿299, and the slot is not the only thing it unlocks
 *
 * The same sheet answers a 402 from POST /trips and the banner the entry flow
 * shows on its first screen when the account is already at the limit, so a
 * person is never told "no" only after filling everything in.
 */
export function TripLimitSheet({
  open,
  onClose,
  allowance,
  onFreed,
}: {
  open: boolean;
  onClose: () => void;
  allowance: TripAllowance;
  /** A slot came free — the caller can retry whatever it was doing. */
  onFreed?: () => void;
}) {
  const close = useCloseTrip();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="แผนฟรีวางแผนได้ทีละทริป"
      description={`ตอนนี้มีทริปที่ยังวางแผนอยู่ ${allowance.activeTrips.length} ทริป — ปิดทริปให้เสร็จ หรือปลดล็อกด้วย Trip Pass ก่อนเริ่มทริปใหม่`}
    >
      <div className="space-y-4">
        <section>
          <p className="section-label mb-2">ทริปที่ใช้สิทธิ์อยู่</p>
          <Card className="divide-border divide-y">
            {allowance.activeTrips.map((trip) => (
              <div key={trip.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/t/${trip.id}` as never}
                    className="text-ink block truncate text-sm font-medium hover:underline"
                  >
                    {trip.title}
                  </Link>
                  <p className="text-muted text-[11px]">ยังวางแผนอยู่ · ปิดแล้วเปิดดูย้อนหลังได้เสมอ</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={close.isPending}
                  onClick={() =>
                    close.mutate(trip.id, {
                      onSuccess: () => onFreed?.(),
                    })
                  }
                >
                  <Check className="size-3.5" /> ปิดทริปนี้
                </Button>
              </div>
            ))}
          </Card>
          <p className="text-muted mt-1.5 text-[11px] leading-relaxed">
            ปิดทริป = ทำเครื่องหมายว่าจบแล้ว ไม่มีอะไรถูกลบ — แพลน รูป และค่าใช้จ่ายยังเปิดดูได้ที่ &ldquo;บันทึกทริป&rdquo;
          </p>
        </section>

        <Card accent="documents" className="p-4">
          <div className="flex items-start gap-3">
            <span className="bg-orange-solid text-ink flex size-10 shrink-0 items-center justify-center rounded-full">
              <Ticket className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-ink font-medium">Trip Pass ฿{allowance.priceThb}</p>
              <p className="text-ink mt-0.5 text-xs leading-relaxed">
                ปลดล็อกทริปที่วางอยู่ทั้งใบ — วางแผนทริปใหม่ควบคู่ได้ทันที
                ให้ AI ร่างแพลนได้ไม่จำกัด และจองผ่าน ROVE แล้วได้คืนเต็มจำนวน
              </p>
              <ButtonLink href="/pricing" size="sm" className="mt-3">
                ซื้อ Trip Pass ฿{allowance.priceThb} <ArrowRight className="size-3.5" />
              </ButtonLink>
            </div>
          </div>
        </Card>
      </div>
    </Sheet>
  );
}

/**
 * The one-line warning the entry flow shows on its first screen when the
 * account is already at the limit — so nobody fills in three screens to be
 * told at the end.
 */
export function TripLimitBanner({
  allowance,
  onOpen,
}: {
  allowance: TripAllowance;
  onOpen: () => void;
}) {
  if (allowance.allowed) return null;
  return (
    <Card accent="warning" className="flex flex-wrap items-center justify-between gap-2 p-3.5">
      <p className="text-ink text-xs leading-relaxed">
        <span className="font-medium">ตอนนี้ใช้สิทธิ์แผนฟรีครบแล้ว</span> — สร้างได้หลังปิดทริปที่วางอยู่
        หรือปลดล็อกด้วย Trip Pass ฿{allowance.priceThb}
      </p>
      <Button size="sm" variant="outline" onClick={onOpen}>
        ดูวิธีปลดล็อก
      </Button>
    </Card>
  );
}
