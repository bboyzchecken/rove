'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  ClipboardPaste,
  MapPin,
  Plane,
  Plus,
  Users,
  X,
} from 'lucide-react';

import { TripLimitBanner, TripLimitSheet } from '@/components/billing/trip-limit-sheet';
import { RoveMark } from '@/components/brand/rove-mark';
import { AirportPicker } from '@/components/trip/airport-picker';
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
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { DateField } from '@/components/ui/date-field';
import { Field, Input, Textarea, fieldClass } from '@/components/ui/field';
import { useCharacters, useMe, useUpdateMe } from '@/features/auth/queries';
import { useCreateTrip, useTripAllowance } from '@/features/trip/queries';
import { track } from '@/lib/analytics';
import { ApiError } from '@/lib/api-client';
import { DEFAULT_CHARACTER_ID } from '@/lib/catalog/characters';
import { repo } from '@/lib/data';
import type { Airport, StartedWith, TripAllowance } from '@/lib/data';
import { addDays, daysBetween, isIsoDate, thaiRangeLabel } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * Entry flow (M1 — W1.2 / W1.3 / W2.8), reshaped by Feedback #2 (D-8, D-9).
 *
 * UAT round 1's tester arrived knowing the dates, holding a hotel booking AND
 * holding tickets — and none of the three doors ("รู้เที่ยวบิน / รู้วัน /
 * ยังไม่รู้วัน") was that. The doors made the group pick ONE thing they knew
 * and pretend not to know the rest, and the room they landed in then asked
 * for the rest as if it were missing. That is ต้นตอร่วม 1 in the fix list.
 *
 * So the first screen is a question, not a choice: "ตอนนี้มีอะไรแล้วบ้าง",
 * tick everything that applies (or nothing). The second screen asks only for
 * what was ticked, in the order that matters — a route decides the dates, so
 * it comes before a date field ever would — and the room remembers the answer
 * (`trip.startedWith`) so its own checklist opens with those steps ticked.
 *
 * D-8: nothing is prefilled. No default week in December, no BKK, no party of
 * four. A field the tester did not fill is a field the tester did not answer,
 * and a default that looks like an answer is how "04/12/2026" became a trip.
 *
 * X1.1 still holds: three screens to a created trip, whatever was ticked.
 */

const HAVE: { key: StartedWith; icon: typeof CalendarDays; title: string; hint: string }[] = [
  {
    key: 'dates',
    icon: CalendarDays,
    title: 'รู้วันแล้ว',
    hint: 'ลาไว้แล้ว หรือตกลงวันกันได้แล้ว',
  },
  {
    key: 'flights',
    icon: Plane,
    title: 'จองไฟลท์แล้ว',
    hint: 'มีตั๋วในมือ — วางข้อความจากอีเมลตั๋วได้เลย',
  },
  {
    key: 'stay',
    icon: BedDouble,
    title: 'จองที่พักแล้ว',
    hint: 'ใส่ชื่อหรือลิงก์ที่พักเก็บไว้ก่อน',
  },
  { key: 'destination', icon: MapPin, title: 'รู้ปลายทางแล้ว', hint: 'รู้แล้วว่าจะไปเมืองไหน' },
  { key: 'friends', icon: Users, title: 'มีเพื่อนไปด้วยแล้ว', hint: 'รู้แล้วว่าไปกันกี่คน' },
];

interface DraftStay {
  id: string;
  name: string;
  url: string;
  /** ISO "yyyy-mm-dd" or "" — dates are optional (Feedback #3 — D-1). */
  checkIn: string;
  checkOut: string;
  showDates: boolean;
}

let stayCounter = 0;
function newStay(patch: Partial<DraftStay> = {}): DraftStay {
  stayCounter += 1;
  return {
    id: `stay-${stayCounter}`,
    name: '',
    url: '',
    checkIn: '',
    checkOut: '',
    showDates: false,
    ...patch,
  };
}

const SAMPLE_TICKET = `Thai Airways — Booking confirmed
TG 682  BKK 23:59 → NRT 08:05  04 Dec 2026
TG 677  NRT 14:35 → BKK 22:05  10 Dec 2026
Passengers: 4`;

export function NewTripFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const presetAirport = params.get('to')?.toUpperCase() ?? '';
  const presetCity = params.get('city');

  const [have, setHave] = useState<StartedWith[]>(() =>
    normaliseEntry(params.get('from'), Boolean(presetAirport || presetCity)),
  );
  // A link that already says what the group has (a landing card, a dream)
  // has answered the first screen; it opens on the second. Anyone arriving
  // plain starts at the question.
  const [step, setStep] = useState(params.get('from') !== null ? 1 : 0);

  // D-8: every field starts blank. The only thing that may arrive filled in
  // is a destination handed over by a link (a dream, a landing card).
  const [legs, setLegs] = useState<DraftLeg[]>(() => [
    newLeg('out', { to: presetAirport }),
    newLeg('back', { from: presetAirport }),
  ]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [destination, setDestination] = useState<Airport | null>(null);
  const [stays, setStays] = useState<DraftStay[]>(() => [newStay()]);
  const [party, setParty] = useState(1);
  const [character, setCharacter] = useState<string | null>(null);
  const [ticket, setTicket] = useState('');
  const [pasting, setPasting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ticketNote, setTicketNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The paywall (D-10): known before the first tap, and answered in a sheet
  // rather than a grey box if POST /trips still says no.
  const { data: allowance } = useTripAllowance();
  const [wall, setWall] = useState<TripAllowance | null>(null);
  const [wallOpen, setWallOpen] = useState(false);

  const { data: me } = useMe();
  const { data: characters } = useCharacters();
  const createTrip = useCreateTrip();
  const updateMe = useUpdateMe();
  const { airports, route, warnings } = useRouteDraft(legs);

  const picked = character ?? me?.characterId ?? DEFAULT_CHARACTER_ID;

  // A link from "ที่อยากไป" carries a city name, not a code. Look it up once
  // so the destination — and the route, should they tick flights — opens on
  // the airport that serves it.
  useEffect(() => {
    if (!presetCity && !presetAirport) return;
    let cancelled = false;

    const lookup = presetAirport
      ? repo.airports.get(presetAirport)
      : repo.airports.search(presetCity ?? '', 1).then(([airport]) => airport ?? null);

    void lookup.then((airport) => {
      if (cancelled || !airport) return;
      setDestination(airport);
      setLegs((prev) =>
        prev.map((leg) =>
          leg.direction === 'out'
            ? { ...leg, to: airport.iata }
            : leg.direction === 'back'
              ? { ...leg, from: airport.iata }
              : leg,
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [presetCity, presetAirport]);

  const has = (key: StartedWith) => have.includes(key);
  const routing = has('flights');
  const asksDates = has('dates') && !routing;
  const asksDestination = has('destination') && !routing;
  const hasTypedDates = isIsoDate(startDate) && isIsoDate(endDate) && startDate <= endDate;
  const coordinating = !routing && !hasTypedDates;
  const nights = routing ? route.nights : hasTypedDates ? daysBetween(startDate, endDate) - 1 : 0;

  // D-2 (Feedback #3): a stay's nights sit inside the trip once the trip has
  // an edge — typed dates, or the first and last flight.
  const tripStart = routing ? route.startDate : hasTypedDates ? startDate : '';
  const tripEnd = routing ? route.endDate : hasTypedDates ? endDate : '';
  const namedStays = stays.filter((stay) => stay.name.trim());

  function updateStay(id: string, patch: Partial<DraftStay>) {
    setStays((current) => current.map((stay) => (stay.id === id ? { ...stay, ...patch } : stay)));
  }

  /** The next hotel usually starts the morning the last one ends. */
  function addStay() {
    setStays((current) => {
      const previous = current[current.length - 1];
      const checkIn = previous?.checkOut ?? '';
      return [...current, newStay({ checkIn, showDates: Boolean(checkIn) })];
    });
  }

  function toggle(key: StartedWith) {
    setHave((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  /** The paste shortcut: the same legs, typed by the airline instead of by you. */
  async function readTicket(text: string) {
    setTicket(text);
    setTicketNote(null);
    if (text.trim().length < 40) return;

    setParsing(true);
    try {
      const parsed = await repo.trips.parseTicket(text);
      if (parsed.flights.length === 0) {
        setTicketNote(
          'อ่านเที่ยวบินไม่ออก — ใส่เองด้านล่างได้เลย หรือวางเฉพาะบรรทัดที่มีรหัสเที่ยวบิน',
        );
        return;
      }

      setLegs(
        parsed.flights.map((flight, index) =>
          newLeg(index === 0 ? 'out' : index === parsed.flights.length - 1 ? 'back' : 'inter', {
            from: flight.from,
            to: flight.to,
            depDate: flight.date,
            depTime: flight.time,
            flightNo: flight.code,
          }),
        ),
      );
      // A ticket says how many are flying; the stepper still starts at one
      // (D-8) and only moves when the ticket actually says so.
      if (parsed.partySize) setParty(parsed.partySize);
      setTicketNote(`อ่านได้ ${parsed.flights.length} เที่ยวบิน — ตรวจแล้วแก้ตรงไหนก็ได้`);
      track('route_built', { legs: parsed.flights.length, countries: 0, source: 'ticket' });
    } finally {
      setParsing(false);
    }
  }

  function whereLabel() {
    if (routing && route.stops[0]) return route.stops[0].city;
    if (destination) return destination.cityTh || destination.city;
    return null;
  }

  function suggestedTitle() {
    const where = whereLabel();
    const start = routing ? route.startDate : hasTypedDates ? startDate : '';
    const year = start ? Number(start.slice(0, 4)) + 543 : NaN;
    if (where) return Number.isFinite(year) ? `${where} ${year}` : where;
    return has('friends') ? 'ทริปใหม่ของแก๊ง' : 'ทริปใหม่';
  }

  /** Each section asks for one thing, and only that thing blocks the next screen. */
  function canContinue() {
    if (routing) return route.stops.length > 0;
    if (asksDates) return hasTypedDates;
    if (asksDestination) return destination !== null;
    return true;
  }

  function blocker() {
    if (routing && route.stops.length === 0) return 'ใส่สนามบินปลายทางและวันบินของขาไปก่อน';
    if (asksDates && !hasTypedDates) return 'ใส่วันไปและวันกลับก่อน';
    if (asksDestination && !destination) return 'เลือกสนามบินปลายทางก่อน';
    return null;
  }

  async function create() {
    setError(null);
    try {
      if (picked !== me?.characterId) await updateMe.mutateAsync({ characterId: picked });

      const trip = await createTrip.mutateAsync({
        entryType: routing ? 'route' : 'date',
        title: suggestedTitle(),
        flights: routing ? legs.filter((leg) => leg.from && leg.to && leg.depDate) : undefined,
        cities: routing ? undefined : destination ? [destination.cityTh || destination.city] : [],
        country: routing ? undefined : destination?.countryCode,
        startDate: !routing && hasTypedDates ? startDate : undefined,
        endDate: !routing && hasTypedDates ? endDate : undefined,
        partySize: party,
        coordinateDates: coordinating,
        startedWith: have,
      });

      // The hotels they already booked go into the room as bookings, so the
      // bookings step opens on them rather than on "nothing yet". A trip that
      // changes city has one per city (Feedback #3 — D-1).
      if (has('stay')) {
        for (const stay of namedStays) {
          await repo.booking.save(trip.id, {
            kind: 'stay',
            title: stay.name.trim(),
            partner: '',
            url: stay.url.trim(),
            status: 'booked',
            checkIn: isIsoDate(stay.checkIn) ? stay.checkIn : undefined,
            checkOut: isIsoDate(stay.checkOut) ? stay.checkOut : undefined,
          });
        }
      }

      router.push(coordinating ? `/t/${trip.id}/dates` : `/t/${trip.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'TRIP_LIMIT') {
        setWall(allowanceFromPayload(cause.payload, allowance));
        setWallOpen(true);
        return;
      }
      setError(cause instanceof Error ? cause.message : 'สร้างทริปไม่สำเร็จ');
    }
  }

  const activeWall = wall ?? allowance ?? null;

  return (
    /*
     * The shell is `px-4 py-5` and nothing else, exactly like /home and
     * /profile: the width comes from the one `max-w-5xl` in AppShell, so the
     * three steps line up with each other and with every other tab instead of
     * each picking its own gutter.
     */
    <div className="px-4 py-5">
      {/* progress ------------------------------------------------------ */}
      <div className="mb-6 flex items-center gap-2 md:mb-8">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition',
              i <= step ? 'bg-primary' : 'bg-surface',
            )}
          />
        ))}
      </div>

      {/* step 0 — what do you already have -------------------------------- */}
      {step === 0 ? (
        <div className="animate-rove-rise">
          <h1 className="font-display text-ink text-2xl font-medium tracking-tight md:text-3xl">
            ตอนนี้มีอะไรแล้วบ้าง
          </h1>
          <p className="text-muted mt-1 text-sm">
            ติ๊กได้หลายข้อ หรือไม่ติ๊กเลยก็ได้ — ที่เหลือค่อยเติมในห้องทริป
          </p>

          {activeWall && !activeWall.allowed ? (
            <div className="mt-4 md:max-w-2xl">
              <TripLimitBanner allowance={activeWall} onOpen={() => setWallOpen(true)} />
            </div>
          ) : null}

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 md:mt-7 md:max-w-2xl">
            {HAVE.map((option) => {
              const on = has(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(option.key)}
                  className="text-left"
                >
                  <Card
                    accent={on ? 'feature' : 'none'}
                    className={cn(
                      'flex h-full items-center gap-3.5 p-4 transition',
                      on ? 'ring-ink ring-2' : 'hover:bg-surface',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-2xl',
                        on ? 'bg-feature-solid text-bg' : 'bg-surface text-ink',
                      )}
                    >
                      <option.icon className="size-5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-ink font-medium">{option.title}</p>
                      <p className="text-muted text-xs">{option.hint}</p>
                    </div>
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full',
                        on ? 'bg-ink text-bg' : 'border-muted/30 border-2',
                      )}
                    >
                      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                  </Card>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 md:mt-8 md:max-w-2xl md:flex-row md:justify-between md:gap-4">
            <p className="text-muted order-2 text-center text-[11px] md:order-1 md:text-left">
              {have.length === 0
                ? 'ยังไม่รู้อะไรเลยก็เริ่มได้ — ให้ทุกคนใส่วันว่างแล้วหาช่วงที่ตรงกันก่อน'
                : `ถัดไปจะถามเฉพาะ ${have.length} อย่างที่ติ๊กไว้`}
            </p>
            <Button
              block
              size="lg"
              className="order-1 md:order-2 md:w-auto md:px-10"
              onClick={() => setStep(1)}
            >
              ต่อไป <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* step 1 — only what was ticked, in the order that matters ----------- */}
      {step === 1 ? (
        <div className="animate-rove-rise">
          <button
            onClick={() => setStep(0)}
            className="text-muted mb-3 inline-flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft className="size-3.5" /> เปลี่ยนสิ่งที่มีแล้ว
          </button>

          <h1 className="font-display text-ink text-2xl font-medium tracking-tight md:text-3xl">
            {routing
              ? 'ใส่เที่ยวบินที่จองไว้'
              : asksDates
                ? 'ไปวันไหน'
                : asksDestination
                  ? 'ไปที่ไหน'
                  : 'ไปกันกี่คน'}
          </h1>
          {routing ? (
            <p className="text-muted mt-1 text-sm">
              ใส่สนามบินกับวันบิน — วันเดินทาง จำนวนคืน และประเทศ ROVE คิดให้เอง
            </p>
          ) : null}

          {/*
            The route is the only section with two things to look at — the
            legs being typed and the trip they add up to. On a phone they
            queue up; from `lg` the summary moves beside the form and sticks.
          */}
          <div
            className={cn(
              'mt-5 md:mt-7',
              routing ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6' : 'space-y-4',
            )}
          >
            {routing ? (
              <>
                <div className="lg:col-start-1 lg:row-start-1">
                  <RouteBuilder
                    legs={legs}
                    onChange={setLegs}
                    airports={airports}
                    warnings={warnings}
                  />
                </div>

                <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
                  <div className="lg:sticky lg:top-20">
                    <RouteSummary route={route} />
                    {route.stops.length === 0 ? (
                      <Card accent="gray" className="hidden p-4 lg:block">
                        <p className="text-ink text-xs leading-relaxed">
                          เลือกสนามบินปลายทางแล้ว สรุปทริป — วันเดินทาง จำนวนคืน และประเทศ —
                          จะขึ้นตรงนี้ให้เห็นระหว่างกรอก
                        </p>
                      </Card>
                    ) : null}
                  </div>
                </aside>
              </>
            ) : null}

            <div
              className={cn(
                'space-y-4 lg:col-start-1 lg:row-start-2',
                routing ? '' : 'md:max-w-2xl',
              )}
            >
              {/* Pasting a ticket fills the same legs, so it lives under them. */}
              {routing ? (
                <div>
                  <button
                    onClick={() => setPasting((v) => !v)}
                    className="text-primary inline-flex items-center gap-1.5 text-xs font-medium"
                  >
                    <ClipboardPaste className="size-3.5" />
                    {pasting ? 'ซ่อนช่องวางตั๋ว' : 'มีอีเมลตั๋วอยู่แล้ว? วางมาเลย'}
                  </button>

                  {pasting ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={ticket}
                        onChange={(e) => void readTicket(e.target.value)}
                        rows={5}
                        placeholder="วางอีเมลยืนยันตั๋ว หรือข้อความจากสายการบินได้เลย"
                        className={cn(fieldClass, 'nums text-xs')}
                      />
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => void readTicket(SAMPLE_TICKET)}
                        disabled={parsing}
                      >
                        {parsing ? 'กำลังอ่าน…' : 'ใส่ตัวอย่างให้ดู'}
                      </Button>
                      {ticketNote ? (
                        <Card accent="feature" className="p-3">
                          <p className="text-ink text-xs">{ticketNote}</p>
                        </Card>
                      ) : null}
                    </div>
                  ) : null}

                  {has('dates') ? (
                    <p className="text-muted mt-3 text-[11px]">
                      วันเดินทางมาจากวันบินที่ใส่ไว้ ไม่ต้องใส่ซ้ำ
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* --- dates ------------------------------------------------ */}
              {asksDates ? (
                <section>
                  <div className="grid grid-cols-2 gap-2">
                    <DateField
                      label="ไปวันที่"
                      value={startDate}
                      onChange={(iso) => {
                        setStartDate(iso);
                        if (iso && endDate && iso > endDate) setEndDate(addDays(iso, 4));
                      }}
                    />
                    <DateField
                      label="กลับวันที่"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={setEndDate}
                    />
                  </div>
                  {/* The day count only exists once both ends do — a count
                      against a blank is the "46365 วัน" of UAT round 1. */}
                  {hasTypedDates ? (
                    <p className="text-muted mt-2 text-xs">
                      {nights + 1} วัน {nights} คืน · {thaiRangeLabel(startDate, endDate)}
                    </p>
                  ) : (
                    <p className="text-muted mt-2 text-xs">ใส่เป็น วัน/เดือน/ปี ค.ศ.</p>
                  )}
                </section>
              ) : null}

              {/* --- destination ------------------------------------------ */}
              {asksDestination ? (
                <section>
                  <AirportPicker
                    label="ลงเครื่องที่สนามบินไหน"
                    value={destination}
                    onChange={setDestination}
                    autoFocus={!asksDates}
                  />
                  <p className="text-muted mt-1.5 text-[11px]">
                    ค้นจากชื่อเมืองก็ได้ — ถ้ายังไม่แน่ใจ ข้ามไปก่อนแล้วค่อยเลือกในห้องทริป
                  </p>
                </section>
              ) : null}

              {/* --- stay --------------------------------------------------- */}
              {has('stay') ? (
                <section className="space-y-3">
                  {stays.map((stay, index) => (
                    <div
                      key={stay.id}
                      className={cn(
                        'space-y-2',
                        stays.length > 1 && 'border-border rounded-2xl border p-3',
                      )}
                    >
                      {stays.length > 1 ? (
                        <div className="flex items-center justify-between">
                          <p className="text-ink text-xs font-medium">ที่พักที่ {index + 1}</p>
                          <button
                            type="button"
                            onClick={() =>
                              setStays((current) => current.filter((s) => s.id !== stay.id))
                            }
                            className="text-muted hover:text-ink inline-flex items-center gap-1 text-[11px]"
                            aria-label={`ลบที่พักที่ ${index + 1}`}
                          >
                            <X className="size-3.5" /> ลบ
                          </button>
                        </div>
                      ) : null}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="ที่พักที่จองไว้">
                          <Input
                            value={stay.name}
                            onChange={(e) => updateStay(stay.id, { name: e.target.value })}
                            placeholder="ชื่อโรงแรม หรือย่านที่พัก"
                          />
                        </Field>
                        <Field label="ลิงก์การจอง (ใส่ทีหลังได้)">
                          <Input
                            value={stay.url}
                            onChange={(e) => updateStay(stay.id, { url: e.target.value })}
                            placeholder="วางลิงก์จาก Agoda / Booking / Airbnb"
                            inputMode="url"
                          />
                        </Field>
                      </div>

                      {stay.showDates ? (
                        <div className="grid grid-cols-2 gap-2">
                          <DateField
                            label="เช็คอิน"
                            value={stay.checkIn}
                            min={tripStart || undefined}
                            max={tripEnd || undefined}
                            onChange={(iso) =>
                              updateStay(stay.id, {
                                checkIn: iso,
                                checkOut:
                                  iso && stay.checkOut && iso > stay.checkOut ? '' : stay.checkOut,
                              })
                            }
                          />
                          <DateField
                            label="เช็คเอาต์"
                            value={stay.checkOut}
                            min={stay.checkIn || tripStart || undefined}
                            max={tripEnd || undefined}
                            onChange={(iso) => updateStay(stay.id, { checkOut: iso })}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateStay(stay.id, { showDates: true })}
                          className="text-primary inline-flex items-center gap-1 text-xs font-medium"
                        >
                          <CalendarDays className="size-3.5" /> ใส่วันที่ (ไม่บังคับ)
                        </button>
                      )}
                    </div>
                  ))}

                  <Button type="button" variant="soft" size="sm" onClick={addStay}>
                    <Plus className="size-4" /> เพิ่มที่พัก
                  </Button>
                  <p className="text-muted text-[11px]">
                    เปลี่ยนเมืองระหว่างทริป? เพิ่มที่พักได้หลายที่
                  </p>
                </section>
              ) : null}

              {/* --- who is coming ----------------------------------------- */}
              {!routing && !asksDates && !asksDestination && !has('stay') ? (
                <Card accent="gray" className="p-4">
                  <p className="text-ink text-xs leading-relaxed">
                    สร้างห้องก่อนโดยยังไม่ต้องมีวัน — ทุกคนเข้ามาแตะวันที่ตัวเองว่าง แล้ว ROVE
                    จะหาช่วงที่ซ้อนกันมากที่สุดให้ พร้อมแนะนำปลายทางที่เหมาะกับจำนวนวันนั้น
                  </p>
                </Card>
              ) : null}

              <Field label="ไปกันกี่คน" group>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setParty((p) => Math.max(1, p - 1))}
                    className="bg-surface text-ink size-10 rounded-full text-lg font-medium"
                    aria-label="ลดจำนวนคน"
                  >
                    −
                  </button>
                  <span className="font-display text-ink w-8 text-center text-xl font-medium">
                    {party}
                  </span>
                  <button
                    type="button"
                    onClick={() => setParty((p) => Math.min(12, p + 1))}
                    className="bg-surface text-ink size-10 rounded-full text-lg font-medium"
                    aria-label="เพิ่มจำนวนคน"
                  >
                    +
                  </button>
                  <span className="text-muted text-xs">
                    {has('friends') ? 'นับตัวเองด้วย · ชวนเพิ่มทีหลังได้' : 'ชวนเพิ่มทีหลังได้ตลอด'}
                  </span>
                </div>
              </Field>
            </div>
          </div>

          <div
            className={cn(
              'mt-6 flex flex-col items-center gap-2 md:mt-8 md:flex-row md:justify-end md:gap-4',
              routing ? '' : 'md:max-w-2xl',
            )}
          >
            {blocker() ? (
              <p className="text-muted order-2 text-center text-[11px] md:order-1 md:text-right">
                {blocker()}
              </p>
            ) : null}
            <Button
              block
              size="lg"
              className="order-1 md:order-2 md:w-auto md:px-10"
              onClick={() => setStep(2)}
              disabled={!canContinue()}
            >
              ต่อไป <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* step 2 — character, summary, create -------------------------------- */}
      {step === 2 ? (
        <div className="animate-rove-rise">
          <button
            onClick={() => setStep(1)}
            className="text-muted mb-3 inline-flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft className="size-3.5" /> กลับไปแก้รายละเอียด
          </button>

          <h1 className="font-display text-ink text-2xl font-medium tracking-tight md:text-3xl">
            เลือกตัวละครของคุณ
          </h1>
          <p className="text-muted mt-1 text-sm">
            เพื่อนในทริปจะเห็นตัวนี้แทนรูปโปรไฟล์ เปลี่ยนทีหลังได้
          </p>

          <div className="mt-5 grid max-w-3xl grid-cols-5 gap-2 sm:grid-cols-8 md:mt-7 md:grid-cols-10 md:gap-3">
            {(characters ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCharacter(c.id)}
                className={cn(
                  'rounded-2xl p-1.5 transition',
                  picked === c.id ? 'bg-ink' : 'bg-surface',
                )}
                title={c.name}
                aria-pressed={picked === c.id}
              >
                <CharacterAvatar characterId={c.id} size="md" className="mx-auto" />
              </button>
            ))}
          </div>

          <Card className="mt-5 max-w-3xl p-4 md:mt-7 md:p-5">
            <p className="section-label mb-2">สรุปทริปที่จะสร้าง</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="ink">
                {routing && route.startDate
                  ? thaiRangeLabel(route.startDate, route.endDate)
                  : hasTypedDates
                    ? thaiRangeLabel(startDate, endDate)
                    : 'ยังไม่กำหนดวัน'}
              </Badge>
              {routing ? (
                route.stops.map((stop) => (
                  <Badge key={stop.airport} tone="feature">
                    {stop.city} {stop.nights} คืน
                  </Badge>
                ))
              ) : whereLabel() ? (
                <Badge tone="feature">{whereLabel()}</Badge>
              ) : null}
              {has('stay')
                ? namedStays.map((stay) => (
                    <Badge key={stay.id} tone="feature">
                      {stay.name.trim()}
                    </Badge>
                  ))
                : null}
              <Badge tone="feature">{party} คน</Badge>
            </div>
            {coordinating ? (
              <p className="text-muted mt-2 text-[11px]">
                สร้างเสร็จจะพาไปหน้า &ldquo;หาวันที่ตรงกัน&rdquo; ทันที
              </p>
            ) : null}
            {routing && route.countries.length > 1 ? (
              <p className="text-muted mt-2 text-[11px]">
                {route.countries.length} ประเทศ — แพลนจะถูกแบ่งเป็นช่วงตามประเทศให้
              </p>
            ) : null}
          </Card>

          {error ? (
            <Card accent="warning" className="mt-3 max-w-3xl p-3">
              <p className="text-ink text-xs">{error}</p>
            </Card>
          ) : null}

          <div className="mt-6 flex max-w-3xl flex-col items-center gap-3 md:mt-8 md:flex-row md:justify-end md:gap-4">
            <p className="text-muted order-2 flex items-center gap-1.5 text-[11px] md:order-1">
              <Check className="size-3.5" /> สร้างเสร็จแล้วชวนเพื่อนด้วยลิงก์เดียว
            </p>
            <Button
              block
              size="lg"
              className="order-1 md:order-2 md:w-auto md:px-10"
              onClick={() => void create()}
              disabled={createTrip.isPending}
            >
              <RoveMark className="size-4" />
              {createTrip.isPending ? 'กำลังสร้าง…' : 'สร้างห้องทริป'}
            </Button>
          </div>
        </div>
      ) : null}

      {activeWall ? (
        <TripLimitSheet
          open={wallOpen}
          onClose={() => setWallOpen(false)}
          allowance={activeWall}
          onFreed={() => {
            setWall(null);
            setWallOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Old links still arrive with `?from=…`. Each used to open a door; now each
 * pre-ticks the box that door stood for. `city` and `ticket` both meant "I
 * know where I am going" in different words.
 */
function normaliseEntry(value: string | null, hasDestination: boolean): StartedWith[] {
  const out: StartedWith[] = [];
  switch (value) {
    case 'route':
    case 'ticket':
      out.push('flights');
      break;
    case 'city':
      out.push('destination');
      break;
    case 'date':
      out.push('dates');
      break;
    default:
      break;
  }
  if (hasDestination && !out.includes('flights') && !out.includes('destination')) {
    out.push('destination');
  }
  return out;
}

/** The 402 body, in the shape the sheet renders; the last GET as a fallback. */
function allowanceFromPayload(
  payload: unknown,
  fallback: TripAllowance | undefined,
): TripAllowance {
  const body = (payload ?? {}) as {
    active_trips?: { id: string; title: string }[];
    limit?: number;
    price_thb?: number;
  };
  return {
    allowed: false,
    activeTrips: body.active_trips ?? fallback?.activeTrips ?? [],
    limit: body.limit ?? fallback?.limit ?? 1,
    priceThb: body.price_thb ?? fallback?.priceThb ?? 299,
  };
}
