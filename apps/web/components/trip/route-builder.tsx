'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bus, Info, Plane, Plus, TriangleAlert, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
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
  const route = useMemo(() => buildRoute(legs, (iata) => found[iata] ?? null), [legs, found]);
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
        <Card key={leg.key} className="@container p-3.5 @lg:p-5">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {leg.mode === 'ground' ? (
                <Bus className="text-muted size-3.5" />
              ) : (
                <Plane className="text-muted size-3.5" />
              )}
              <span className="text-muted text-[11px] font-medium">
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
                  className="text-primary text-[11px] font-medium"
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

          {/*
            These break on the *card's* width, not the window's — hence the
            `@container` above. The same builder is mounted twice: as wide as
            the page in the entry flow, and inside the route sheet, which is
            narrower than the window it floats in. Window breakpoints handed
            that sheet a desktop layout it had no room for — two airports and
            three fields crushed into 400px. Under `@lg` (32rem of card) the
            legs read top-to-bottom instead, with the arrow turned to match.
          */}
          <div className="grid gap-1.5 @lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @lg:items-end @lg:gap-2">
            <AirportPicker
              label="จาก"
              value={airports[leg.from] ?? null}
              code={leg.from}
              autoFocus={index === 0 && !leg.from}
              onChange={(airport) => patch(leg.key, { from: airport?.iata ?? '' })}
            />
            <ArrowRight className="text-muted mx-auto size-4 rotate-90 @lg:mx-0 @lg:mb-3 @lg:rotate-0" />
            <AirportPicker
              label="ถึง"
              value={airports[leg.to] ?? null}
              code={leg.to}
              onChange={(airport) => patch(leg.key, { to: airport?.iata ?? '' })}
            />
          </div>

          {/* Date, time and flight number are one row of facts off the ticket,
              so they share a line once the card is wide enough to hold three
              fields without squeezing them, and pair up when it is not. */}
          <div
            className={cn(
              'mt-2.5 grid gap-2 @2xs:grid-cols-2 @lg:mt-3',
              leg.mode === 'flight' && '@2xl:grid-cols-3',
            )}
          >
            <Field label={leg.mode === 'ground' ? 'เดินทางวันที่' : 'บินวันที่'}>
              <Input
                type="date"
                value={leg.depDate}
                onChange={(e) => patch(leg.key, { depDate: e.target.value })}
                className="nums"
              />
            </Field>
            <Field label="ถึงกี่โมง (ใส่ทีหลังได้)">
              <Input
                type="time"
                value={leg.arrTime ?? ''}
                onChange={(e) => patch(leg.key, { arrTime: e.target.value })}
                className="nums"
              />
            </Field>

            {leg.mode === 'flight' ? (
              <Field label="เที่ยวบิน (ใส่ทีหลังได้)" className="@2xs:col-span-2 @2xl:col-span-1">
                <Input
                  value={leg.flightNo ?? ''}
                  onChange={(e) => patch(leg.key, { flightNo: e.target.value.toUpperCase() })}
                  placeholder="เช่น TG682"
                  className="nums"
                />
              </Field>
            ) : null}
          </div>

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
                className="accent-primary border-field-border size-4 rounded-md"
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
          accent={warning.level === 'warn' ? 'yellow' : 'blue'}
          className="flex items-start gap-2 p-3.5"
        >
          {warning.level === 'warn' ? (
            <TriangleAlert className="text-ink mt-0.5 size-3.5 shrink-0" />
          ) : (
            <Info className="text-ink mt-0.5 size-3.5 shrink-0" />
          )}
          <p className="text-ink text-xs leading-relaxed">{warning.text}</p>
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
    <Card accent="green" className={cn('p-4', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="section-label">ทริปนี้จะเป็นแบบนี้</p>
        <span className="text-ink nums text-xs font-bold">
          {route.days} วัน {route.nights} คืน
        </span>
      </div>

      <ul className="space-y-1.5">
        {route.stops.map((stop) => (
          <li
            key={`${stop.airport}-${stop.arriveDate}`}
            className="flex items-center gap-2 text-xs"
          >
            <span className="leading-none">{flagOf(stop.countryCode)}</span>
            <span className="text-ink font-medium">{stop.city}</span>
            <span className="text-muted nums">
              {thaiDate(stop.arriveDate)}
              {stop.arriveTime ? ` ${stop.arriveTime} น.` : ''}
              {stop.departDate ? ` – ${thaiDate(stop.departDate)}` : ''}
            </span>
            <span className="text-ink nums ml-auto shrink-0 font-bold">
              {stop.open ? 'ยังไม่มีขากลับ' : `${stop.nights} คืน`}
            </span>
          </li>
        ))}
      </ul>

      {route.countries.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {route.countries.map((country) => (
            <Badge key={country.code} tone="blue">
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
