'use client';

import { useState } from 'react';
import { Check, ExternalLink, Plus, Trash2 } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  useBookingOffers,
  useBookings,
  useRemoveBooking,
  useSaveBooking,
  useSetBookingStatus,
} from '@/features/prep/queries';
import type { BookingKind, BookingStatus } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Bookings tab (M12 — W12.2).
 *
 * ROVE never takes a payment: every "จอง" goes out to a partner and comes back
 * as a status the group keeps for itself. The affiliate link is the business
 * model (D0.6), so it is labelled as one rather than disguised as a product.
 */
const KINDS: { key: BookingKind; label: string }[] = [
  { key: 'stay', label: 'ที่พัก' },
  { key: 'activity', label: 'กิจกรรม/ตั๋ว' },
  { key: 'transport', label: 'เดินทาง' },
  { key: 'esim', label: 'ซิม/เน็ต' },
  { key: 'insurance', label: 'ประกัน' },
];

const STATUS_META: Record<
  BookingStatus,
  { label: string; tone: 'neutral' | 'matcha' | 'outline' }
> = {
  idea: { label: 'ยังไม่จอง', tone: 'outline' },
  booked: { label: 'จองแล้ว', tone: 'matcha' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'neutral' },
};

export function BookingScreen({ tripId }: { tripId: string }) {
  const [kind, setKind] = useState<BookingKind>('stay');
  const { data: saved = [], isLoading } = useBookings(tripId);
  const { data: offers = [] } = useBookingOffers(tripId, kind);
  const save = useSaveBooking(tripId);
  const setStatus = useSetBookingStatus(tripId);
  const remove = useRemoveBooking(tripId);

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader label={`ที่จองไว้แล้ว ${saved.length} รายการ`} />
        {isLoading ? (
          <div className="rounded-brand bg-surface h-24 animate-pulse" />
        ) : saved.length === 0 ? (
          <EmptyState
            image="/brand/empty/empty-expense.webp"
            title="ยังไม่ได้จองอะไร"
            hint="เลือกจากตัวเลือกด้านล่าง กดไปจองที่พาร์ตเนอร์ แล้วกลับมาทำเครื่องหมายว่าจองแล้ว"
          />
        ) : (
          <Card className="divide-border divide-y">
            {saved.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-espresso text-sm font-semibold">{entry.title}</p>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {entry.partner}
                    {entry.pricePerPersonThb
                      ? ` · ${formatMoney(entry.pricePerPersonThb, 'THB')}/คน`
                      : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_META[entry.status].tone}>
                      {STATUS_META[entry.status].label}
                    </Badge>
                    {entry.confirmationCode ? (
                      <span className="text-muted nums text-[11px]">
                        เลขที่จอง {entry.confirmationCode}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {entry.status !== 'booked' ? (
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => setStatus.mutate({ bookingId: entry.id, status: 'booked' })}
                    >
                      <Check className="size-3.5" /> จองแล้ว
                    </Button>
                  ) : null}
                  <button
                    aria-label={`ลบ ${entry.title}`}
                    onClick={() => remove.mutate(entry.id)}
                    className="text-muted hover:text-danger flex size-8 items-center justify-center rounded-full"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionHeader label="ตัวเลือกที่แนะนำ" />
        <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
          {KINDS.map((option) => (
            <button
              key={option.key}
              onClick={() => setKind(option.key)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                kind === option.key ? 'bg-espresso text-bg' : 'bg-surface text-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {offers.map((offer) => (
            <Card key={offer.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-espresso text-sm font-semibold">{offer.title}</p>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {offer.partner}
                    {offer.pricePerPersonThb
                      ? ` · ประมาณ ${formatMoney(offer.pricePerPersonThb, 'THB')}/คน`
                      : ''}
                  </p>
                  {offer.note ? (
                    <p className="text-muted mt-1 text-[11px] leading-relaxed">{offer.note}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="bg-espresso text-bg font-display inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                  >
                    ไปจอง <ExternalLink className="size-3" />
                  </a>
                  <button
                    onClick={() => save.mutate({ ...offer, status: 'idea' })}
                    className="text-primary inline-flex items-center gap-1 text-[11px] font-semibold"
                  >
                    <Plus className="size-3" /> เก็บไว้ในทริป
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <p className="text-muted mt-3 text-[11px] leading-relaxed">
          ROVE ไม่ได้รับเงินจากคุณ — ถ้าจองผ่านลิงก์เหล่านี้ ROVE ได้ค่าแนะนำจากพาร์ตเนอร์
          ราคาที่คุณจ่ายเท่าเดิม
        </p>
      </section>
    </div>
  );
}
