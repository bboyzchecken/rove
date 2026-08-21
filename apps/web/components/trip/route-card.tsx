'use client';

import { useState } from 'react';
import { ArrowRight, Bus, Plane, Plus } from 'lucide-react';

import {
  RouteBuilder,
  RouteSummary,
  newLeg,
  useRouteDraft,
  type DraftLeg,
} from '@/components/trip/route-builder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useSetTripRoute, useTripRoute } from '@/features/trip/queries';
import type { FlightLeg, FlightLegInput } from '@/lib/data';
import { flagOf } from '@/lib/data/airports';
import { thaiDate } from '@/lib/data/domain';

/** Where a Thai group almost always leaves from. */
const HOME_AIRPORT = 'BKK';

/**
 * The route, in the trip room (M1 — W2.2).
 *
 * The group this is for starts with two facts — "ลง NRT 4 ธ.ค. 08:05" and
 * "กลับ 10 ธ.ค. ถึง 22:05" — and then fills the rest in over weeks. So the card
 * shows what is known, names what is missing, and every gap is one tap from
 * being filled: the arrival time that decides whether day one is a full day,
 * the flight number, the leg between two cities nobody has booked yet.
 */
export function RouteCard({ tripId, editable }: { tripId: string; editable: boolean }) {
  const { data: route, isLoading } = useTripRoute(tripId);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="rounded-brand bg-surface h-28 animate-pulse" />;

  const flights = route?.flights ?? [];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="section-label">เส้นทาง</p>
        {editable ? (
          <button onClick={() => setEditing(true)} className="text-primary text-xs font-semibold">
            {flights.length > 0 ? 'แก้เที่ยวบิน' : 'ใส่เที่ยวบิน'}
          </button>
        ) : null}
      </div>

      {flights.length === 0 ? (
        <Card accent="sky" className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-display text-espresso font-bold">ยังไม่ได้ใส่เที่ยวบิน</p>
            <p className="text-muted mt-0.5 text-xs">
              ใส่สนามบินกับวันบิน แล้ววันเดินทาง จำนวนคืน และประเทศจะถูกตั้งให้อัตโนมัติ
            </p>
          </div>
          {editable ? (
            <Button onClick={() => setEditing(true)}>
              <Plus className="size-4" /> ใส่เที่ยวบิน
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-2.5">
          <Card className="divide-border divide-y">
            {flights.map((leg) => (
              <LegRow key={leg.id} leg={leg} />
            ))}
          </Card>

          {route ? <RouteSummary route={route} /> : null}

          {route && !route.roundTrip ? (
            <p className="text-muted text-[11px]">
              ยังไม่มีขากลับ — แพลนจะจบที่วันสุดท้ายที่มีข้อมูลไปก่อน
            </p>
          ) : null}
        </div>
      )}

      {editable ? (
        <RouteDialog
          tripId={tripId}
          flights={flights}
          open={editing}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </section>
  );
}

function LegRow({ leg }: { leg: FlightLeg }) {
  const missing = !leg.arrTime;

  return (
    <div className="flex items-center gap-3 p-3.5">
      <span className="bg-surface text-espresso flex size-9 shrink-0 items-center justify-center rounded-2xl">
        {leg.mode === 'ground' ? <Bus className="size-4" /> : <Plane className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-espresso nums flex items-center gap-1.5 text-sm font-bold">
          {leg.from} <ArrowRight className="text-muted size-3" /> {leg.to}
          {leg.flightNo ? (
            <span className="text-muted text-[11px] font-normal">{leg.flightNo}</span>
          ) : null}
        </p>
        <p className="text-muted nums mt-0.5 text-[11px]">
          {thaiDate(leg.depDate)}
          {leg.depTime ? ` ออก ${leg.depTime} น.` : ''}
          {leg.arrTime ? ` · ถึง ${leg.arrTime} น.` : ''}
          {leg.arrDate && leg.arrDate !== leg.depDate ? ` (${thaiDate(leg.arrDate)})` : ''}
        </p>
      </div>

      {missing ? <Badge tone="outline">ยังไม่รู้เวลาถึง</Badge> : null}
    </div>
  );
}

/**
 * The same builder the entry flow uses, so a leg is edited the way it was made.
 *
 * Mounted only while open — reopening has to show what is saved now, not what
 * someone was half-way through typing last time, and a fresh mount says that
 * without an effect that copies props into state.
 */
function RouteDialog({
  tripId,
  flights,
  open,
  onClose,
}: {
  tripId: string;
  flights: FlightLeg[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <RouteEditor tripId={tripId} flights={flights} onClose={onClose} />;
}

function RouteEditor({
  tripId,
  flights,
  onClose,
}: {
  tripId: string;
  flights: FlightLeg[];
  onClose: () => void;
}) {
  const save = useSetTripRoute(tripId);
  const [legs, setLegs] = useState<DraftLeg[]>(() =>
    flights.length > 0
      ? flights.map((leg) => ({ ...leg, key: leg.id }))
      : [newLeg('out', { from: HOME_AIRPORT }), newLeg('back', { to: HOME_AIRPORT })],
  );

  const { airports, route, warnings } = useRouteDraft(legs);

  async function submit() {
    await save.mutateAsync(legs.filter((leg) => leg.from && leg.to && leg.depDate).map(toLegInput));
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="เส้นทางของทริป"
      description="วันเดินทางและปลายทางของทริปจะอัปเดตตามเที่ยวบินที่ใส่ไว้"
      /* Wider than the default sheet: this one holds a whole route — two or
         three legs, each with two airports and three fields — and at 28rem the
         builder has to stack every one of them. */
      className="sm:max-w-2xl"
      footer={
        <Button block size="lg" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก…' : 'บันทึกเส้นทาง'}
        </Button>
      }
    >
      <div className="space-y-3">
        <RouteBuilder legs={legs} onChange={setLegs} airports={airports} warnings={warnings} />
        <RouteSummary route={route} />

        {route.countries.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {route.countries.map((country) => (
              <Badge key={country.code} tone="sky">
                {flagOf(country.code)} {country.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Drops the builder's local key; the server owns leg ids and their order. */
function toLegInput(leg: DraftLeg): FlightLegInput {
  return {
    direction: leg.direction,
    mode: leg.mode,
    airline: leg.airline,
    flightNo: leg.flightNo,
    from: leg.from,
    to: leg.to,
    depDate: leg.depDate,
    depTime: leg.depTime,
    arrDate: leg.arrDate,
    arrTime: leg.arrTime,
    note: leg.note,
  };
}
