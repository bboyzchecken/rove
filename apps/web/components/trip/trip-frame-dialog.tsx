'use client';

import { useState } from 'react';

import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input, fieldClass } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/features/auth/queries';
import { useTripOverview, useUpdateTrip } from '@/features/trip/queries';
import type { Trip, TripColor, UpdateTripInput } from '@/lib/data';
import { daysBetween } from '@/lib/data/domain';
import { TRIP_COLORS, TRIP_COLOR_LABEL, tripColorClasses } from '@/lib/trip-color';
import { cn } from '@/lib/utils';

import { DateField } from '@/components/ui/date-field';
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
  const { data: me } = useMe();
  const { data: overview } = useTripOverview(tripId);
  // The colour is the owner's to change (D-3); everyone else sees it, not the
  // swatches. Same rule the API keeps.
  const isOwner = overview?.members.find((m) => m.id === me?.id)?.role === 'owner';
  const [color, setColor] = useState<TripColor>(trip.color);
  const [title, setTitle] = useState(trip.title);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [partySize, setPartySize] = useState(trip.partySize);
  const [budget, setBudget] = useState(trip.budgetPerPersonThb);
  const [cities, setCities] = useState(trip.cities.join(', '));

  const nights = startDate && endDate ? Math.max(0, daysBetween(startDate, endDate) - 1) : 0;
  const hasRoute = (trip.route?.flights.length ?? 0) > 0;

  async function save() {
    const patch: UpdateTripInput = {
      title: title.trim() || trip.title,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      partySize,
      budgetPerPersonThb: budget,
      cities: cities
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    };
    if (isOwner && color !== trip.color) {
      patch.color = color;
    }
    await update.mutateAsync(patch);
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
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        {/* The trip's colour (Feedback #2 — D-3, brand spec §2.7): the same
            pair follows the trip to the home screen, the calendar and the
            room header, so the swatches show the light half — that is what
            most of those surfaces paint with. */}
        {isOwner ? (
          <div role="group" aria-label="สีประจำทริป">
            <FieldLabel>สีประจำทริป</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TRIP_COLORS.map((option) => {
                const classes = tripColorClasses(option);
                const active = option === color;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    aria-label={TRIP_COLOR_LABEL[option]}
                    title={TRIP_COLOR_LABEL[option]}
                    onClick={() => setColor(option)}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full transition',
                      classes.light,
                      active ? 'ring-ink ring-2 ring-offset-2' : 'hover:scale-105',
                    )}
                  >
                    {active ? <Check className="text-ink size-4" strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>
            <span className="text-muted mt-1 block text-[11px]">
              ใช้สีเดียวกันในหน้าทริปของฉัน ปฏิทิน และหัวห้องทริป
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <DateField label="ไปวันที่" value={startDate} onChange={setStartDate} />
          <DateField
            label="กลับวันที่"
            value={endDate}
            min={startDate || undefined}
            onChange={setEndDate}
          />
        </div>
        {startDate && endDate ? (
          <p className="text-muted -mt-1 text-[11px]">
            {nights + 1} วัน {nights} คืน
          </p>
        ) : null}

        <Field label="เมือง (คั่นด้วยเครื่องหมายจุลภาค)">
          <Input
            value={cities}
            onChange={(e) => setCities(e.target.value)}
            placeholder="โตเกียว, เกียวโต"
          />
        </Field>

        {/* With a route on the trip these fields are derived, so say so rather
            than let someone type a city the next leg edit will overwrite. */}
        {hasRoute ? (
          <p className="text-muted -mt-1 text-[11px]">
            ทริปนี้มีเที่ยวบินอยู่แล้ว —
            วันเดินทางและเมืองจะถูกตั้งใหม่ตามเส้นทางทุกครั้งที่แก้เที่ยวบิน แก้ที่
            &ldquo;เส้นทาง&rdquo; ในหน้าภาพรวมจะตรงกว่า
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Field label="ไปกันกี่คน">
            <Input
              type="number"
              min={1}
              max={12}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className={cn(fieldClass, 'nums')}
            />
          </Field>
          <Field label="งบต่อคน (บาท)">
            <Input
              type="number"
              min={0}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className={cn(fieldClass, 'nums')}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

