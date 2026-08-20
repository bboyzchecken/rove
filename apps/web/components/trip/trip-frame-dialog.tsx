'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useUpdateTrip } from '@/features/trip/queries';
import type { Trip } from '@/lib/data';
import { daysBetween } from '@/lib/data/domain';

/**
 * Inline frame edit (M2 — W2.3). The mutation behind it is optimistic, so the
 * numbers on the overview move the moment this closes.
 */
export function TripFrameDialog({
  tripId,
  trip,
  open,
  onClose,
}: {
  tripId: string;
  trip: Trip;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateTrip(tripId);
  const [title, setTitle] = useState(trip.title);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [partySize, setPartySize] = useState(trip.partySize);
  const [budget, setBudget] = useState(trip.budgetPerPersonThb);
  const [cities, setCities] = useState(trip.cities.join(', '));

  const nights = startDate && endDate ? Math.max(0, daysBetween(startDate, endDate) - 1) : 0;
  const hasRoute = (trip.route?.flights.length ?? 0) > 0;

  async function save() {
    await update.mutateAsync({
      title: title.trim() || trip.title,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      partySize,
      budgetPerPersonThb: budget,
      cities: cities
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="แก้กรอบทริป"
      description="เปลี่ยนได้ตลอด — แพลนกับงบจะคำนวณตามให้เอง"
      footer={
        <Button block size="lg" onClick={() => void save()} disabled={update.isPending}>
          {update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      }
    >
      <div className="space-y-3.5">
        <Field label="ชื่อทริป">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="ไปวันที่">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </Field>
          <Field label="กลับวันที่">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </Field>
        </div>
        {startDate && endDate ? (
          <p className="text-muted -mt-1 text-[11px]">
            {nights + 1} วัน {nights} คืน
          </p>
        ) : null}

        <Field label="เมือง (คั่นด้วยเครื่องหมายจุลภาค)">
          <input
            value={cities}
            onChange={(e) => setCities(e.target.value)}
            placeholder="โตเกียว, เกียวโต"
            className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
          />
        </Field>

        {/* With a route on the trip these fields are derived, so say so rather
            than let someone type a city the next leg edit will overwrite. */}
        {hasRoute ? (
          <p className="text-muted -mt-1 text-[11px]">
            ทริปนี้มีเที่ยวบินอยู่แล้ว — วันเดินทางและเมืองจะถูกตั้งใหม่ตามเส้นทางทุกครั้งที่แก้เที่ยวบิน
            แก้ที่ &ldquo;เส้นทาง&rdquo; ในหน้าภาพรวมจะตรงกว่า
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Field label="ไปกันกี่คน">
            <input
              type="number"
              min={1}
              max={12}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="bg-surface text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </Field>
          <Field label="งบต่อคน (บาท)">
            <input
              type="number"
              min={0}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="bg-surface text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
