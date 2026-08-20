'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarSearch,
  Check,
  MapPin,
  Ticket,
} from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useCharacters, useUpdateMe } from '@/features/auth/queries';
import { useCreateTrip } from '@/features/trip/queries';
import { repo } from '@/lib/data';
import type { ParsedTicket } from '@/lib/data';
import { addDays, daysBetween, thaiRangeLabel } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * Entry flow (M1 — W1.2 dates, W1.3 city, W1.4 pasted ticket, W2.8 no dates yet).
 *
 * The constraint from X1.1 is the design: every route reaches a created trip
 * in at most three screens, so this is entry → details → done. The character
 * pick rides along on the last screen (W14.3) because it costs one tap.
 *
 * "ยังไม่รู้วัน" is the fourth door and the honest one for a group chat: it
 * creates the room with no dates at all and drops everyone on the date board.
 */
type Entry = 'date' | 'city' | 'ticket' | 'coordinate';

const ENTRIES: { key: Entry; icon: typeof CalendarDays; title: string; hint: string }[] = [
  { key: 'date', icon: CalendarDays, title: 'เริ่มจากวัน', hint: 'รู้วันลาแล้ว' },
  { key: 'coordinate', icon: CalendarSearch, title: 'ยังไม่รู้วัน', hint: 'หาวันที่ทุกคนว่างก่อน' },
  { key: 'city', icon: MapPin, title: 'เริ่มจากเมือง', hint: 'รู้ว่าอยากไปไหน' },
  { key: 'ticket', icon: Ticket, title: 'วางข้อความตั๋ว', hint: 'จองตั๋วไว้แล้ว' },
];

/** Suggestions only — the field takes any destination in the world. */
const CITIES = [
  'โตเกียว',
  'เกียวโต',
  'โซล',
  'ไทเป',
  'ดานัง',
  'บาหลี',
  'ลิสบอน',
  'เรคยาวิก',
  'เมลเบิร์น',
];

const SAMPLE_TICKET = `Thai Airways — Booking confirmed
TG 682  BKK 23:59 → HND 07:05  15 Nov 2026
TG 673  KIX 12:20 → BKK 16:30  22 Nov 2026
Passengers: 4`;

const DEFAULT_START = '2026-11-15';
const DEFAULT_END = '2026-11-22';

export function NewTripFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('from') as Entry | null;
  const presetCity = params.get('city');

  const [entry, setEntry] = useState<Entry | null>(initial);
  const [step, setStep] = useState(initial ? 1 : 0);
  const [cities, setCities] = useState<string[]>(presetCity ? [presetCity] : ['โตเกียว', 'เกียวโต']);
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [party, setParty] = useState(4);
  const [character, setCharacter] = useState('shiba');
  const [ticket, setTicket] = useState('');
  const [parsed, setParsed] = useState<ParsedTicket | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: characters } = useCharacters();
  const createTrip = useCreateTrip();
  const updateMe = useUpdateMe();

  const coordinating = entry === 'coordinate';
  const nights = coordinating ? 0 : Math.max(0, daysBetween(startDate, endDate) - 1);

  async function readTicket(text: string) {
    setTicket(text);
    setParsed(null);
    if (text.trim().length < 40) return;

    setParsing(true);
    try {
      const result = await repo.trips.parseTicket(text);
      setParsed(result);
      if (result.startDate) setStartDate(result.startDate);
      if (result.endDate) setEndDate(result.endDate);
      if (result.partySize) setParty(result.partySize);
      if (result.cities.length > 0) setCities(result.cities);
    } finally {
      setParsing(false);
    }
  }

  function suggestedTitle() {
    if (coordinating) return 'ทริปใหม่ของแก๊ง';
    const where = cities[0] ?? 'ทริปใหม่';
    const year = Number(startDate.slice(0, 4)) + 543;
    return `${where} ${year}`;
  }

  async function create() {
    setError(null);
    try {
      if (character) await updateMe.mutateAsync({ characterId: character });

      const trip = await createTrip.mutateAsync({
        entryType: coordinating ? 'date' : (entry ?? 'date'),
        title: suggestedTitle(),
        cities: coordinating ? [] : cities,
        startDate: coordinating ? undefined : startDate,
        endDate: coordinating ? undefined : endDate,
        partySize: party,
        coordinateDates: coordinating,
      });

      router.push(coordinating ? `/t/${trip.id}/dates` : `/t/${trip.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'สร้างทริปไม่สำเร็จ');
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* progress ------------------------------------------------------ */}
      <div className="mb-6 flex items-center gap-2">
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
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            เริ่มทริปใหม่ยังไงดี
          </h1>
          <p className="text-muted mt-1 text-sm">เลือกอันที่ตรงกับสิ่งที่รู้อยู่ตอนนี้</p>

          <div className="mt-5 space-y-2.5">
            {ENTRIES.map((option) => (
              <button
                key={option.key}
                onClick={() => {
                  setEntry(option.key);
                  setStep(1);
                }}
                className="w-full text-left"
              >
                <Card className="hover:shadow-warm flex items-center gap-3.5 p-4 transition">
                  <span className="bg-primary/12 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
                    <option.icon className="size-5" strokeWidth={2.2} />
                  </span>
                  <div className="flex-1">
                    <p className="font-display text-espresso font-bold">{option.title}</p>
                    <p className="text-muted text-xs">{option.hint}</p>
                  </div>
                  <ArrowRight className="text-muted size-4" />
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

          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            {entry === 'date'
              ? 'ไปวันไหน'
              : entry === 'coordinate'
                ? 'ไปกันกี่คน'
                : entry === 'city'
                  ? 'อยากไปเมืองไหน'
                  : 'วางข้อความตั๋วมาเลย'}
          </h1>

          <div className="mt-5 space-y-4">
            {entry === 'coordinate' ? (
              <Card accent="sky" className="p-4">
                <p className="text-espresso text-xs leading-relaxed">
                  สร้างห้องก่อนโดยยังไม่ต้องมีวัน — ทุกคนเข้ามาแตะวันที่ตัวเองว่าง
                  แล้ว ROVE จะหาช่วงที่ซ้อนกันมากที่สุดให้ พร้อมแนะนำปลายทางที่เหมาะกับจำนวนวันนั้น
                </p>
              </Card>
            ) : null}

            {entry === 'ticket' ? (
              <>
                <textarea
                  value={ticket}
                  onChange={(e) => void readTicket(e.target.value)}
                  rows={6}
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

                {parsed && parsed.flights.length > 0 ? (
                  <Card accent="matcha" className="animate-rove-rise p-4">
                    <p className="section-label mb-2">อ่านออกมาได้แบบนี้</p>
                    <ul className="text-espresso space-y-1.5 text-xs">
                      {parsed.flights.map((flight, index) => (
                        <li key={`${flight.code}-${index}`}>
                          ✈️ {index === 0 ? 'ขาไป' : 'ขากลับ'} {flight.code} · {flight.from} →{' '}
                          {flight.to} · {flight.date}
                          {flight.time ? ` ${flight.time}` : ''}
                        </li>
                      ))}
                      <li>
                        👥 {parsed.partySize ?? party} คน · {nights + 1} วัน {nights} คืน
                      </li>
                    </ul>
                    {parsed.simulated ? (
                      <p className="text-muted mt-2 text-[11px]">
                        โหมดทดลอง: อ่านจากข้อความตรง ๆ ยังไม่ได้ส่งให้ AI ตรวจ
                      </p>
                    ) : null}
                  </Card>
                ) : null}

                {parsed && parsed.flights.length === 0 ? (
                  <Card accent="sun" className="p-3.5">
                    <p className="text-espresso text-xs">
                      อ่านเที่ยวบินไม่ออก — ใส่วันเองได้ที่ขั้นถัดไป หรือลองวางเฉพาะส่วนที่มีรหัสเที่ยวบิน
                    </p>
                  </Card>
                ) : null}
              </>
            ) : null}

            {entry === 'date' || (entry === 'ticket' && parsed) ? (
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
            ) : null}

            {entry === 'date' ? (
              <p className="text-muted text-xs">
                {nights + 1} วัน {nights} คืน · {thaiRangeLabel(startDate, endDate)}
              </p>
            ) : null}

            {entry === 'city' || entry === 'date' ? (
              <Field
                label={
                  entry === 'city'
                    ? 'เลือกเมือง (เลือกได้หลายเมือง)'
                    : 'อยากไปเมืองไหนบ้าง (ข้ามได้)'
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  {CITIES.map((city) => {
                    const on = cities.includes(city);
                    return (
                      <button
                        key={city}
                        onClick={() =>
                          setCities((prev) =>
                            on ? prev.filter((c) => c !== city) : [...prev, city],
                          )
                        }
                        className={cn(
                          'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                          on ? 'bg-espresso text-bg' : 'bg-surface text-muted',
                        )}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </Field>
            ) : null}

            {entry === 'city' && cities.length > 0 ? (
              <Card accent="sky" className="p-3.5">
                <p className="text-espresso text-xs leading-relaxed">
                  {cities.length} เมืองแบบไม่รีบ ควรใช้เวลาประมาณ{' '}
                  <span className="font-bold">{cities.length * 3 + 1} วัน</span> —
                  เลือกวันจริงทีหลังได้
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

          <Button block size="lg" className="mt-6" onClick={() => setStep(2)}>
            ต่อไป <ArrowRight className="size-4" />
          </Button>
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

          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            เลือกตัวละครของคุณ
          </h1>
          <p className="text-muted mt-1 text-sm">
            เพื่อนในทริปจะเห็นตัวนี้แทนรูปโปรไฟล์ เปลี่ยนทีหลังได้
          </p>

          <div className="mt-5 grid grid-cols-5 gap-2">
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

          <Card className="mt-5 p-4">
            <p className="section-label mb-2">สรุปทริปที่จะสร้าง</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="primary">
                {coordinating ? 'ยังไม่กำหนดวัน' : thaiRangeLabel(startDate, endDate)}
              </Badge>
              {cities.map((c) => (
                <Badge key={c} tone="sky">
                  {c}
                </Badge>
              ))}
              <Badge tone="matcha">{party} คน</Badge>
            </div>
            {coordinating ? (
              <p className="text-muted mt-2 text-[11px]">
                สร้างเสร็จจะพาไปหน้า &ldquo;หาวันที่ตรงกัน&rdquo; ทันที
              </p>
            ) : null}
          </Card>

          {error ? (
            <Card accent="primary" className="mt-3 p-3">
              <p className="text-espresso text-xs">{error}</p>
            </Card>
          ) : null}

          <Button
            block
            size="lg"
            className="mt-6"
            onClick={() => void create()}
            disabled={createTrip.isPending}
          >
            <RoveMark className="size-4" />
            {createTrip.isPending ? 'กำลังสร้าง…' : 'สร้างห้องทริป'}
          </Button>

          <p className="text-muted mt-3 flex items-center justify-center gap-1.5 text-[11px]">
            <Check className="size-3.5" /> สร้างเสร็จแล้วชวนเพื่อนด้วยลิงก์เดียว
          </p>
        </div>
      ) : null}
    </div>
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
