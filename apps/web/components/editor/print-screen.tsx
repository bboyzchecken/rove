'use client';

import { useEffect, useRef } from 'react';

import { usePlanDays } from '@/features/plan/queries';
import { useTrip } from '@/features/trip/queries';
import { daysBetween } from '@/lib/data/domain';
import type { ItemType, PlanDay, PlanItem } from '@/lib/data';
import { formatMoney, formatThaiRange } from '@/lib/format';

const TYPE_LABEL: Record<ItemType, string> = {
  poi: 'สถานที่',
  meal: 'มื้ออาหาร',
  transport: 'เดินทาง',
  stay: 'ที่พัก',
  free: 'เวลาว่าง',
  flight: 'เที่ยวบิน',
};

const TRAVEL_LABEL: Record<'train' | 'walk' | 'bus' | 'car', string> = {
  train: 'รถไฟ',
  walk: 'เดิน',
  bus: 'รถบัส',
  car: 'รถยนต์',
};

/**
 * The print/PDF itinerary (Feedback #4 — F3/D-4).
 *
 * The tester's complaint was literal: printing cut a card in half, mid-line.
 * The old paths (mock's whole-app `window.print()`, live's export-endpoint
 * HTML) never had a print stylesheet at all. This page is built for paper
 * from the start:
 *
 *   - one `<table>` per day, so a day too long for one page repeats its
 *     `<thead>` — the only way Chrome and Safari carry a heading across a
 *     page break without a paged-media library neither ships (there is no
 *     reliable way to make the repeat say "(ต่อ)" only on the continuation
 *     pages; every browser that can print this repeats the same heading)
 *   - `break-before-page` between days, `break-inside-avoid` on every row, so
 *     a page break can only fall between items, never inside one
 *   - no `position: fixed` anywhere — that was what pinned the old footer
 *     over the last line of every page
 *
 * Reached via `repo`, so it renders the same in mock and live — the old split
 * between them is gone (see `plan-board.tsx`'s `openPrintable`).
 */
export function PrintScreen({ tripId }: { tripId: string }) {
  const { data: trip, isLoading: tripLoading } = useTrip(tripId);
  const { data: days = [], isLoading: daysLoading } = usePlanDays(tripId);

  const printed = useRef(false);
  useEffect(() => {
    if (printed.current || tripLoading || daysLoading || !trip) return;
    printed.current = true;
    // Two frames so fonts and layout have settled before the print dialog
    // measures the page — a print triggered mid-layout is where stray page
    // breaks come from.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => window.print()),
    );
    return () => cancelAnimationFrame(raf);
  }, [tripLoading, daysLoading, trip]);

  if (tripLoading || daysLoading) {
    return <p className="text-muted p-8 text-sm">กำลังเตรียมหน้าพิมพ์…</p>;
  }

  if (!trip) {
    return <p className="text-muted p-8 text-sm">ไม่พบทริปนี้</p>;
  }

  const dateRange =
    trip.startDate && trip.endDate
      ? `${formatThaiRange(trip.startDate, trip.endDate)} · ${daysBetween(trip.startDate, trip.endDate)} วัน ${trip.nights} คืน`
      : '';

  return (
    <div className="text-ink mx-auto max-w-[720px] px-8 py-10 print:px-0 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
      `}</style>

      <button
        onClick={() => window.print()}
        className="bg-ink text-bg mb-6 rounded-full px-4 py-2 text-xs font-medium print:hidden"
      >
        พิมพ์ / บันทึกเป็น PDF
      </button>

      <h1 className="font-display text-2xl font-medium tracking-tight">{trip.title}</h1>
      {dateRange ? <p className="text-muted mt-1 text-sm">{dateRange}</p> : null}

      {days.length === 0 ? (
        <p className="text-muted mt-8 text-sm">ทริปนี้ยังไม่มีแพลน</p>
      ) : (
        days.map((day, index) => (
          <DayTable key={day.id} day={day} fxRate={trip.fxRate} first={index === 0} />
        ))
      )}

      <p className="text-muted border-border mt-9 border-t pt-3 text-xs">
        พิมพ์จาก ROVE · ค่าใช้จ่ายจริงของกลุ่มไม่ถูกรวมในไฟล์นี้
      </p>
    </div>
  );
}

function DayTable({ day, fxRate, first }: { day: PlanDay; fxRate: number; first: boolean }) {
  return (
    <table className={`mt-7 w-full border-collapse ${first ? '' : 'break-before-page'}`}>
      <thead>
        <tr className="break-after-avoid">
          <th colSpan={2} className="border-border border-b pt-2 pb-1.5 text-left">
            <span className="font-display text-sm font-medium">
              {day.label} · {day.city}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {day.items.map((item) => (
          <ItemRow key={item.id} item={item} fxRate={fxRate} />
        ))}
      </tbody>
    </table>
  );
}

function ItemRow({ item, fxRate }: { item: PlanItem; fxRate: number }) {
  const meta: string[] = [TYPE_LABEL[item.type]];
  if (item.area) meta.push(item.area);
  if (item.costJpy) {
    meta.push(
      `¥${item.costJpy.toLocaleString('en-US')} · ${formatMoney(Math.round(item.costJpy * fxRate), 'THB')}`,
    );
  }

  return (
    <tr className="break-inside-avoid">
      <td className="text-muted nums w-14 py-2 pr-3 text-right align-top text-xs">
        {item.start}
        {item.end ? (
          <>
            <br />
            {item.end}
          </>
        ) : null}
      </td>
      <td className="border-border border-b py-2 align-top">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-muted text-xs">{meta.join(' · ')}</p>
        {item.note ? <p className="text-muted mt-0.5 text-xs">{item.note}</p> : null}
        {item.warning ? (
          <p className="text-warning mt-0.5 text-xs font-medium">⚠ {item.warning}</p>
        ) : null}
        {item.travel ? (
          <p className="text-muted mt-0.5 text-xs">
            → {TRAVEL_LABEL[item.travel.mode]} {item.travel.minutes} นาที
            {item.travel.line ? ` · ${item.travel.line}` : ''}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
