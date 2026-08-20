'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bus, Info, Plane, Plus, TriangleAlert, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AirportPicker } from '@/components/trip/airport-picker';
import { repo } from '@/lib/data';
import type { Airport, FlightLegInput, LegDirection, TripRoute } from '@/lib/data';
import { flagOf } from '@/lib/data/airports';
import { thaiDate } from '@/lib/data/domain';
import { buildRoute, routeWarnings, type RouteWarning } from '@/lib/data/route';
import { cn } from '@/lib/utils';

/**
 * The route builder (M1 — W1.3).
 *
 * The group that uses this already knows the answer to "ไปไหน": they are
 * holding a ticket. What they want is for the trip to know it too —
 *
 *   BKK → NRT   4 ธ.ค. ถึง 08:05
 *   NRT → BKK   10 ธ.ค. ถึง 22:05
 *
 * — and then to keep filling in the detail around it. So the legs are the
 * first thing the app asks for, and everything else (dates, destinations,
 * how many countries, how many nights in each) is derived rather than typed
 * a second time.
 */

/** A leg while it is being typed: the airports may still be blank. */
export type DraftLeg = FlightLegInput & { key: string };

let counter = 0;
export function newLeg(direction: LegDirection, patch: Partial<DraftLeg> = {}): DraftLeg {
  counter += 1;
  return {
    key: `leg-${counter}`,
    direction,
    mode: 'flight',
    from: '',
    to: '',
    depDate: '',
    ...patch,
  };
}

/** The pair every screen that shows a route needs. */
export function useRouteDraft(legs: DraftLeg[]) {
  const codes = useMemo(
    () => [...new Set(legs.flatMap((leg) => [leg.from, leg.to]).filter(Boolean))].sort(),
    [legs],
  );

  const { data: airports } = useQuery({
    queryKey: ['airports', 'resolve', codes.join(',')],
    queryFn: () => repo.airports.resolve(codes),
    enabled: codes.length > 0,
    staleTime: Infinity,
  });

  const found = useMemo(() => airports ?? {}, [airports]);
  const route = useMemo(
    () => buildRoute(legs, (iata) => found[iata] ?? null),
    [legs, found],
  );
  const warnings = useMemo(() => routeWarnings(route, legs), [route, legs]);

  return { airports: found, route, warnings };
}

const DIRECTION_LABEL: Record<LegDirection, string> = {
  out: 'ขาไป',
  inter: 'ระหว่างเมือง',
  back: 'ขากลับ',
};

export function RouteBuilder({
  legs,
  onChange,
  airports,
  warnings,
}: {
  legs: DraftLeg[];
  onChange: (legs: DraftLeg[]) => void;
  airports: Record<string, Airport>;
  warnings: RouteWarning[];
}) {
  /**
   * Editing where a leg lands drags the next leg's departure with it, as long
   * as the two were still chained. Without that, changing the middle of a route
   * silently leaves a hole between two cities — the exact ambiguity this screen
   * exists to remove. Break the chain on purpose by editing "จาก" afterwards.
   */
  function patch(key: string, next: Partial<DraftLeg>) {
    const index = legs.findIndex((leg) => leg.key === key);
    if (index < 0) return;

    const before = legs[index]!;
    const updated = legs.map((leg) => (leg.key === key ? { ...leg, ...next } : leg));

    const following = updated[index + 1];
    if (next.to !== undefined && next.to !== before.to && following?.from === before.to) {
      updated[index + 1] = { ...following, from: next.to };
    }
    onChange(updated);
  }

  function remove(key: string) {
    onChange(legs.filter((leg) => leg.key !== key));
  }

  /**
   * A leg between destinations belongs before the flight home, and it starts
   * where the previous one landed. Adding one therefore splits the stay rather
   * than tacking a second trip onto the end of the first.
   */
  function addLeg(direction: LegDirection) {
    const backIndex = legs.findIndex((leg) => leg.direction === 'back');
    const at = direction === 'inter' && backIndex >= 0 ? backIndex : legs.length;

    const previous = legs[at - 1];
    const next = legs[at];
    const added = newLeg(direction, {
      from: previous?.to ?? '',
      to: direction === 'back' ? (legs[0]?.from ?? '') : '',
      // Halfway through the stay it splits, so neither half starts at zero
      // nights — a date anyone can drag afterwards, but never a nonsense one.
      depDate: midpoint(previous?.depDate, next?.depDate),
    });

    const updated = [...legs.slice(0, at), added, ...legs.slice(at)];
    // The flight home now leaves from wherever this new leg lands, which is
    // blank until it is picked — the summary says so until it is.
    if (next && next.from === previous?.to) {
      updated[at + 1] = { ...next, from: '' };
    }
    onChange(updated);
  }

  const hasReturn = legs.some((leg) => leg.direction === 'back');

  return (
    <div className="space-y-2.5">
      {legs.map((leg, index) => (
        <Card key={leg.key} className="p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {leg.mode === 'ground' ? (
                <Bus className="text-muted size-3.5" />
              ) : (
                <Plane className="text-muted size-3.5" />
              )}
              <span className="text-muted text-[11px] font-semibold">
                {DIRECTION_LABEL[leg.direction]}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {leg.direction === 'inter' ? (
                <button
                  type="button"
                  onClick={() =>
                    patch(leg.key, { mode: leg.mode === 'ground' ? 'flight' : 'ground' })
                  }
                  className="text-primary text-[11px] font-semibold"
                >
                  {leg.mode === 'ground' ? 'เปลี่ยนเป็นเที่ยวบิน' : 'ไปเอง (รถไฟ/รถ)'}
                </button>
              ) : null}
              {legs.length > 1 ? (
                <button
                  type="button"
                  onClick={() => remove(leg.key)}
                  aria-label={`ลบ${DIRECTION_LABEL[leg.direction]}`}
                  className="text-muted"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <AirportPicker
              label="จาก"
              value={airports[leg.from] ?? null}
              code={leg.from}
              autoFocus={index === 0 && !leg.from}
              onChange={(airport) => patch(leg.key, { from: airport?.iata ?? '' })}
            />
            <ArrowRight className="text-muted mb-3 size-4" />
            <AirportPicker
              label="ถึง"
              value={airports[leg.to] ?? null}
              code={leg.to}
              onChange={(airport) => patch(leg.key, { to: airport?.iata ?? '' })}
            />
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-muted mb-1.5 block text-[11px] font-semibold">
                {leg.mode === 'ground' ? 'เดินทางวันที่' : 'บินวันที่'}
              </span>
              <input
                type="date"
                value={leg.depDate}
                onChange={(e) => patch(leg.key, { depDate: e.target.value })}
                className="bg-bg text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="text-muted mb-1.5 block text-[11px] font-semibold">
                ถึงกี่โมง (ใส่ทีหลังได้)
              </span>
              <input
                type="time"
                value={leg.arrTime ?? ''}
                onChange={(e) => patch(leg.key, { arrTime: e.target.value })}
                className="bg-bg text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
              />
            </label>
          </div>

          {leg.mode === 'flight' ? (
            <label className="mt-2.5 block">
              <span className="text-muted mb-1.5 block text-[11px] font-semibold">
                เที่ยวบิน (ใส่ทีหลังได้)
              </span>
              <input
                value={leg.flightNo ?? ''}
                onChange={(e) => patch(leg.key, { flightNo: e.target.value.toUpperCase() })}
                placeholder="เช่น TG682"
                className="bg-bg text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
              />
            </label>
          ) : null}

          {/* The overnight case, which is the one that shifts a whole day. */}
          {leg.arrTime && leg.depDate ? (
            <label className="text-muted mt-2 flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={Boolean(leg.arrDate && leg.arrDate !== leg.depDate)}
                onChange={(e) =>
                  patch(leg.key, {
                    arrDate: e.target.checked ? nextDay(leg.depDate) : leg.depDate,
                  })
                }
              />
              ถึงวันรุ่งขึ้น (บินข้ามคืน)
            </label>
          ) : null}
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="soft" size="sm" onClick={() => addLeg('inter')}>
          <Plus className="size-3.5" /> เพิ่มเมือง/ประเทศระหว่างทาง
        </Button>
        {!hasReturn ? (
          <Button variant="soft" size="sm" onClick={() => addLeg('back')}>
            <Plus className="size-3.5" /> เพิ่มขากลับ
          </Button>
        ) : null}
      </div>

      {warnings.map((warning) => (
        <Card
          key={warning.id}
          accent={warning.level === 'warn' ? 'sun' : 'sky'}
          className="flex items-start gap-2 p-3.5"
        >
          {warning.level === 'warn' ? (
            <TriangleAlert className="text-espresso mt-0.5 size-3.5 shrink-0" />
          ) : (
            <Info className="text-espresso mt-0.5 size-3.5 shrink-0" />
          )}
          <p className="text-espresso text-xs leading-relaxed">{warning.text}</p>
        </Card>
      ))}
    </div>
  );
}

/**
 * The route as the rest of the app reads it: where you sleep, for how long,
 * and in which country. This is the answer the old city chips could not give.
 */
export function RouteSummary({ route, className }: { route: TripRoute; className?: string }) {
  if (route.stops.length === 0) return null;

  return (
    <Card accent="matcha" className={cn('p-4', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="section-label">ทริปนี้จะเป็นแบบนี้</p>
        <span className="text-espresso nums text-xs font-bold">
          {route.days} วัน {route.nights} คืน
        </span>
      </div>

      <ul className="space-y-1.5">
        {route.stops.map((stop) => (
          <li key={`${stop.airport}-${stop.arriveDate}`} className="flex items-center gap-2 text-xs">
            <span className="leading-none">{flagOf(stop.countryCode)}</span>
            <span className="text-espresso font-semibold">{stop.city}</span>
            <span className="text-muted nums">
              {thaiDate(stop.arriveDate)}
              {stop.arriveTime ? ` ${stop.arriveTime} น.` : ''}
              {stop.departDate ? ` – ${thaiDate(stop.departDate)}` : ''}
            </span>
            <span className="text-espresso nums ml-auto shrink-0 font-bold">
              {stop.open ? 'ยังไม่มีขากลับ' : `${stop.nights} คืน`}
            </span>
          </li>
        ))}
      </ul>

      {route.countries.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {route.countries.map((country) => (
            <Badge key={country.code} tone="sky">
              {flagOf(country.code)} {country.name} {country.nights} คืน
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/** The day halfway between two legs, or the first one when there is no second. */
function midpoint(from?: string, to?: string) {
  if (!from) return to ?? '';
  if (!to) return from;

  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return from;

  return new Date(start + Math.round((end - start) / 2 / 86_400_000) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
