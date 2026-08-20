'use client';

import { useState } from 'react';
import { CalendarDays, Check, MapPin, Pencil, Users, X } from 'lucide-react';

import { useUpdateTrip } from '@/features/trip/queries';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatDateRange, nightsBetween } from '@/lib/format';
import type { TripOverview } from '@/types/api';

/**
 * W2.3 — the trip frame, editable in place. The update is optimistic (see
 * useUpdateTrip), so the header re-renders with the new title the instant the
 * tick is pressed.
 */
export function TripFrameCard({
  tripId,
  overview,
  canEdit,
}: {
  tripId: string;
  overview: TripOverview;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { trip } = overview;

  const nights = nightsBetween(trip.start_date, trip.end_date);
  const cities = trip.destination_cities ?? [];

  if (editing) {
    return <FrameEditor tripId={tripId} overview={overview} onDone={() => setEditing(false)} />;
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl leading-tight">{trip.title}</h1>

          <dl className="mt-3 space-y-1.5 text-sm text-muted">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <dd>
                {formatDateRange(trip.start_date, trip.end_date)}
                {nights > 0 ? ` · ${nights} คืน` : ''}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0" />
              <dd>
                {trip.party_size} คน
                {overview.counts.members > 1 ? ` · เข้าห้องแล้ว ${overview.counts.members}` : ''}
              </dd>
            </div>
            {cities.length > 0 ? (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <dd>{cities.join(' · ')}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {canEdit ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label="แก้ข้อมูลทริป"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function FrameEditor({
  tripId,
  overview,
  onDone,
}: {
  tripId: string;
  overview: TripOverview;
  onDone: () => void;
}) {
  const { trip } = overview;
  const [title, setTitle] = useState(trip.title);
  const [startDate, setStartDate] = useState(trip.start_date?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(trip.end_date?.slice(0, 10) ?? '');
  const [partySize, setPartySize] = useState(trip.party_size);

  const update = useUpdateTrip(tripId);
  const rangeInvalid = Boolean(startDate && endDate && endDate < startDate);

  function save() {
    if (rangeInvalid) return;
    update.mutate(
      {
        title,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        party_size: partySize,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <Card>
      <div className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="ชื่อทริป"
          className="font-display text-lg"
        />

        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="วันไป"
          />
          <Input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="วันกลับ"
          />
        </div>
        {rangeInvalid ? (
          <p className="text-xs text-danger">วันกลับต้องไม่มาก่อนวันไป</p>
        ) : null}

        <Input
          type="number"
          min={1}
          max={30}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value) || 1)}
          aria-label="จำนวนคน"
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>
            <X className="h-4 w-4" />
            ยกเลิก
          </Button>
          <Button size="sm" loading={update.isPending} disabled={rangeInvalid} onClick={save}>
            <Check className="h-4 w-4" />
            บันทึก
          </Button>
        </div>
      </div>
    </Card>
  );
}
