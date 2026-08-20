'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarSearch,
  Check,
  ClipboardPaste,
  Plane,
} from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { RouteBuilder, RouteSummary, newLeg, useRouteDraft, type DraftLeg } from '@/components/trip/route-builder';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useCharacters, useUpdateMe } from '@/features/auth/queries';
import { useCreateTrip } from '@/features/trip/queries';
import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import { addDays, daysBetween, thaiRangeLabel } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * Entry flow (M1 — W1.2 / W1.3 / W2.8).
 *
 * Three doors, and they no longer overlap. The old set had four, two of which
 * asked the same question in different words: "เริ่มจากเมือง" wanted a city
 * name and "วางข้อความตั๋ว" wanted the ticket that names the same city. Worse,
 * the city answer was ambiguous — someone who picked "โซล" and "อูเอโนะ" had
 * told us nothing about whether that is one country or two, or how they cross
 * between them, and the planner cannot draft days it cannot place.
 *
 * So the doors are now sorted by what the group actually knows:
 *
 *   1. รู้เที่ยวบินแล้ว  → the route: airports, dates, arrival times. Pasting a
 *                          ticket is a shortcut *inside* this door, not a door
 *                          of its own — it fills in the same legs.
 *   2. รู้วันแล้ว        → dates now, destination later.
 *   3. ยังไม่รู้วัน      → the date board finds the days first.
 *
 * X1.1 still holds: every door reaches a created trip in at most three screens.
 */
type Entry = 'route' | 'date' | 'coordinate';

const ENTRIES: { key: Entry; icon: typeof CalendarDays; title: string; hint: string }[] = [
  { key: 'route', icon: Plane, title: 'รู้เที่ยวบินแล้ว', hint: 'ใส่สนามบินและวันบิน เดี๋ยวจัดวันให้' },
  { key: 'date', icon: CalendarDays, title: 'รู้วันแล้ว', hint: 'ลาไว้แล้ว ยังไม่รู้จะไปไหน' },
  { key: 'coordinate', icon: CalendarSearch, title: 'ยังไม่รู้วัน', hint: 'หาวันที่ทุกคนว่างก่อน' },
];

const SAMPLE_TICKET = `Thai Airways — Booking confirmed
TG 682  BKK 23:59 → NRT 08:05  04 Dec 2026
TG 677  NRT 14:35 → BKK 22:05  10 Dec 2026
Passengers: 4`;

const DEFAULT_START = '2026-12-04';
const DEFAULT_END = '2026-12-10';
/** Where a Thai group almost always leaves from — one less field to fill. */
const HOME_AIRPORT = 'BKK';

export function NewTripFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = normaliseEntry(params.get('from'));
  const presetAirport = params.get('to');
  const presetCity = params.get('city');

  const [entry, setEntry] = useState<Entry | null>(initial);
  const [step, setStep] = useState(initial ? 1 : 0);
  const [legs, setLegs] = useState<DraftLeg[]>(() => [
    newLeg('out', { from: HOME_AIRPORT, to: presetAirport?.toUpperCase() ?? '', depDate: DEFAULT_START }),
    newLeg('back', { from: presetAirport?.toUpperCase() ?? '', to: HOME_AIRPORT, depDate: DEFAULT_END }),
  ]);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [party, setParty] = useState(4);
  const [character, setCharacter] = useState('shiba');
  const [ticket, setTicket] = useState('');
  const [pasting, setPasting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [ticketNote, setTicketNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: characters } = useCharacters();
  const createTrip = useCreateTrip();
  const updateMe = useUpdateMe();
  const { airports, route, warnings } = useRouteDraft(legs);

  // A link from "ที่อยากไป" carries a city name, not a code. Look it up once so
  // the route opens on the airport that serves it.
  useEffect(() => {
    if (!presetCity || presetAirport) return;
    let cancelled = false;

    void repo.airports.search(presetCity, 1).then(([airport]) => {
      if (cancelled || !airport) return;
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

  const coordinating = entry === 'coordinate';
  const routing = entry === 'route';
  const nights = routing ? route.nights : Math.max(0, daysBetween(startDate, endDate) - 1);

  /** The paste shortcut: the same legs, typed by the airline instead of by you. */
  async function readTicket(text: string) {
    setTicket(text);
    setTicketNote(null);
    if (text.trim().length < 40) return;

    setParsing(true);
    try {
      const parsed = await repo.trips.parseTicket(text);
      if (parsed.flights.length === 0) {
        setTicketNote('อ่านเที่ยวบินไม่ออก — ใส่เองด้านล่างได้เลย หรือวางเฉพาะบรรทัดที่มีรหัสเที่ยวบิน');
        return;
      }

      setLegs(
        parsed.flights.map((flight, index) =>
          newLeg(
            index === 0 ? 'out' : index === parsed.flights.length - 1 ? 'back' : 'inter',
            {
              from: flight.from,
              to: flight.to,
              depDate: flight.date,
              depTime: flight.time,
              flightNo: flight.code,
            },
          ),
        ),
      );
      if (parsed.partySize) setParty(parsed.partySize);
      setTicketNote(`อ่านได้ ${parsed.flights.length} เที่ยวบิน — ตรวจแล้วแก้ตรงไหนก็ได้`);
      track('route_built', { legs: parsed.flights.length, countries: 0, source: 'ticket' });
    } finally {
      setParsing(false);
    }
  }

  function suggestedTitle() {
    if (coordinating) return 'ทริปใหม่ของแก๊ง';
    const where = routing ? (route.stops[0]?.city ?? 'ทริปใหม่') : 'ทริปใหม่';
    const year = Number((routing ? route.startDate : startDate).slice(0, 4)) + 543;
    return Number.isFinite(year) ? `${where} ${year}` : where;
  }

  /** The one rule: a route decides the frame, everything else is typed. */
  function canContinue() {
    if (!routing) return true;
    return route.stops.length > 0;
  }

  async function create() {
    setError(null);
    try {
      if (character) await updateMe.mutateAsync({ characterId: character });

      const trip = await createTrip.mutateAsync({
        entryType: coordinating ? 'date' : routing ? 'route' : 'date',
        title: suggestedTitle(),
        flights: routing ? legs.filter((leg) => leg.from && leg.to && leg.depDate) : undefined,
        cities: routing ? undefined : [],
        startDate: coordinating || routing ? undefined : startDate,
        endDate: coordinating || routing ? undefined : endDate,
        partySize: party,
        coordinateDates: coordinating,
      });

      router.push(coordinating ? `/t/${trip.id}/dates` : `/t/${trip.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'สร้างทริปไม่สำเร็จ');
    }
  }

  return (
    /*
     * The shell is `px-4 py-5` and nothing else, exactly like /home, /trips and
     * /profile: the width comes from the one `max-w-5xl` in AppShell, so the
     * three steps line up with each other and with every other tab instead of
     * each picking its own gutter. Where a full-width row would be silly — two
     * date inputs stretched over 60rem — the *content* is capped, never the
     * shell, so the headings never move sideways between steps.
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

      {/* step 0 -------------------------------------------------------- */}
      {step === 0 ? (
        <div className="animate-rove-rise">
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight md:text-3xl">
            ตอนนี้รู้อะไรแล้วบ้าง
          </h1>
          <p className="text-muted mt-1 text-sm">
            เลือกอันที่ใกล้ที่สุด เดี๋ยวที่เหลือค่อยเติมทีหลัง
          </p>

          {/* A list of three on a phone, three doors side by side on a desk. */}
          <div className="mt-5 grid gap-2.5 sm:grid-cols-3 md:mt-7 md:gap-4">
            {ENTRIES.map((option) => (
              <button
                key={option.key}
                onClick={() => {
                  setEntry(option.key);
                  setStep(1);
                }}
                className="h-full text-left"
              >
                <Card className="hover:shadow-warm flex h-full items-center gap-3.5 p-4 transition sm:flex-col sm:items-start sm:gap-3 sm:p-5">
                  <span className="bg-primary/12 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
                    <option.icon className="size-5" strokeWidth={2.2} />
                  </span>
                  <div className="flex-1 sm:flex-none">
                    <p className="font-display text-espresso font-bold">{option.title}</p>
                    <p className="text-muted text-xs">{option.hint}</p>
                  </div>
                  <ArrowRight className="text-muted size-4 shrink-0 sm:mt-auto" />
                </Card>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* step 1 -------------------------------------------------------- */}
      {step === 1 ? (
        <div className="animate-rove-rise">
          <button
            onClick={() => setStep(0)}
            className="text-muted mb-3 inline-flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="size-3.5" /> เปลี่ยนวิธีเริ่ม
          </button>

          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight md:text-3xl">
            {routing ? 'บินไปลงที่ไหน' : coordinating ? 'ไปกันกี่คน' : 'ไปวันไหน'}
          </h1>
          {routing ? (
            <p className="text-muted mt-1 text-sm">
              ใส่สนามบินกับวันบิน — วันเดินทาง จำนวนคืน และประเทศ ROVE คิดให้เอง
            </p>
          ) : null}

          {/*
            The route door is the only one with two things to look at — the legs
            being typed and the trip they add up to. On a phone they queue up;
            from `lg` the summary moves beside the form and sticks, so the night
            count reacts in place instead of scrolling away. The other doors
            have one column of content and keep one column.
          */}
          <div
            className={cn(
              'mt-5 md:mt-7',
              routing ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6' : 'space-y-4',
            )}
          >
            {/* --- route door ------------------------------------------- */}
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

                {/*
                  One summary, two places: directly under the legs on a phone,
                  and — via the row/column placement rather than a second copy —
                  sticky beside them from `lg` up, where it stays in view while
                  the dates below are still being typed.
                */}
                <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
                  <div className="lg:sticky lg:top-20">
                    <RouteSummary route={route} />
                    {/* An empty column would read as a broken layout, so until a
                        destination is picked the column says what will land in
                        it. Phones skip it: there the summary is just the next
                        block down, and a placeholder would only be noise. */}
                    {route.stops.length === 0 ? (
                      <Card accent="sky" className="hidden p-4 lg:block">
                        <p className="text-espresso text-xs leading-relaxed">
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
                    className="text-primary inline-flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <ClipboardPaste className="size-3.5" />
                    {pasting ? 'ซ่อนช่องวางตั๋ว' : 'มีอีเมลตั๋วอยู่แล้ว? วางมาเลย'}
                  </button>

                  {pasting ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={ticket}
                        onChange={(e) => void readTicket(e.target.value)}
                        rows={5}
                        placeholder="วางอีเมลยืนยันตั๋ว หรือข้อความจากสายการบินได้เลย"
                        className="bg-surface text-espresso nums w-full rounded-2xl p-3.5 text-xs outline-none"
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
                        <Card accent="sun" className="p-3">
                          <p className="text-espresso text-xs">{ticketNote}</p>
                        </Card>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* --- date door -------------------------------------------- */}
              {entry === 'date' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="ไปวันที่">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (e.target.value > endDate) setEndDate(addDays(e.target.value, 4));
                        }}
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

                  <p className="text-muted text-xs">
                    {nights + 1} วัน {nights} คืน · {thaiRangeLabel(startDate, endDate)}
                  </p>

                  <Card accent="sky" className="p-4">
                    <p className="text-espresso text-xs leading-relaxed">
                      ยังไม่ต้องเลือกปลายทางตอนนี้ — สร้างห้องแล้ว ROVE จะแนะนำที่ที่เหมาะกับ{' '}
                      {nights + 1} วันนี้ให้ พอจองตั๋วได้แล้วค่อยใส่เที่ยวบินทีหลัง
                    </p>
                    <button
                      onClick={() => setEntry('route')}
                      className="text-primary mt-2 text-xs font-semibold"
                    >
                      จองตั๋วแล้ว? ใส่เที่ยวบินเลยดีกว่า →
                    </button>
                  </Card>
                </>
              ) : null}

              {/* --- coordinate door -------------------------------------- */}
              {coordinating ? (
                <Card accent="sky" className="p-4">
                  <p className="text-espresso text-xs leading-relaxed">
                    สร้างห้องก่อนโดยยังไม่ต้องมีวัน — ทุกคนเข้ามาแตะวันที่ตัวเองว่าง แล้ว ROVE
                    จะหาช่วงที่ซ้อนกันมากที่สุดให้ พร้อมแนะนำปลายทางที่เหมาะกับจำนวนวันนั้น
                  </p>
                </Card>
              ) : null}

              <Field label="ไปกันกี่คน">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setParty((p) => Math.max(1, p - 1))}
                    className="bg-surface text-espresso size-10 rounded-full text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="font-display text-espresso w-8 text-center text-xl font-extrabold">
                    {party}
                  </span>
                  <button
                    onClick={() => setParty((p) => Math.min(12, p + 1))}
                    className="bg-surface text-espresso size-10 rounded-full text-lg font-bold"
                  >
                    +
                  </button>
                  <span className="text-muted text-xs">ชวนเพิ่มทีหลังได้ตลอด</span>
                </div>
              </Field>
            </div>
          </div>

          {/* Full-width thumb target on a phone; a button the size of its own
              label once there is a mouse. */}
          <div
            className={cn(
              'mt-6 flex flex-col items-center gap-2 md:mt-8 md:flex-row md:justify-end md:gap-4',
              routing ? '' : 'md:max-w-2xl',
            )}
          >
            {routing && !canContinue() ? (
              <p className="text-muted order-2 text-center text-[11px] md:order-1 md:text-right">
                ใส่สนามบินปลายทางและวันบินของขาไปก่อน
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

      {/* step 2 -------------------------------------------------------- */}
      {step === 2 ? (
        <div className="animate-rove-rise">
          <button
            onClick={() => setStep(1)}
            className="text-muted mb-3 inline-flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="size-3.5" /> กลับไปแก้รายละเอียด
          </button>

          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight md:text-3xl">
            เลือกตัวละครของคุณ
          </h1>
          <p className="text-muted mt-1 text-sm">
            เพื่อนในทริปจะเห็นตัวนี้แทนรูปโปรไฟล์ เปลี่ยนทีหลังได้
          </p>

          {/* Twenty characters: four rows on a phone, two on a desk. */}
          <div className="mt-5 grid max-w-3xl grid-cols-5 gap-2 sm:grid-cols-8 md:mt-7 md:grid-cols-10 md:gap-3">
            {(characters ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setCharacter(c.id)}
                className={cn(
                  'rounded-2xl p-1.5 transition',
                  character === c.id ? 'bg-espresso' : 'bg-surface',
                )}
                title={c.name}
              >
                <CharacterAvatar characterId={c.id} size="md" className="mx-auto" />
              </button>
            ))}
          </div>

          <Card className="mt-5 max-w-3xl p-4 md:mt-7 md:p-5">
            <p className="section-label mb-2">สรุปทริปที่จะสร้าง</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="primary">
                {coordinating
                  ? 'ยังไม่กำหนดวัน'
                  : routing
                    ? thaiRangeLabel(route.startDate, route.endDate)
                    : thaiRangeLabel(startDate, endDate)}
              </Badge>
              {routing
                ? route.stops.map((stop) => (
                    <Badge key={stop.airport} tone="sky">
                      {stop.city} {stop.nights} คืน
                    </Badge>
                  ))
                : null}
              <Badge tone="matcha">{party} คน</Badge>
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
            <Card accent="primary" className="mt-3 max-w-3xl p-3">
              <p className="text-espresso text-xs">{error}</p>
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
    </div>
  );
}

/**
 * Old links still arrive with `?from=city` and `?from=ticket`. Both meant "I
 * know where I am going", which is now one door.
 */
function normaliseEntry(value: string | null): Entry | null {
  switch (value) {
    case 'route':
    case 'city':
    case 'ticket':
      return 'route';
    case 'date':
      return 'date';
    case 'coordinate':
      return 'coordinate';
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-[11px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
