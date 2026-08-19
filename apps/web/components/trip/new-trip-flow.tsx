'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, Check, MapPin, Ticket } from 'lucide-react';

import { RoveMark } from '@/components/brand/rove-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { CHARACTERS } from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * Entry flow (M1 — W1.2 dates, W1.3 city, W1.4 pasted ticket).
 *
 * The constraint from X1.1 is the design: every route reaches a created trip
 * in at most three screens, so this is entry → details → done. The character
 * pick rides along on the last screen (W14.3) because it costs one tap.
 */
type Entry = 'date' | 'city' | 'ticket';

const ENTRIES: { key: Entry; icon: typeof CalendarDays; title: string; hint: string }[] = [
  { key: 'date', icon: CalendarDays, title: 'เริ่มจากวัน', hint: 'รู้วันลาแล้ว' },
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

export function NewTripFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('from') as Entry | null;

  const [entry, setEntry] = useState<Entry | null>(initial);
  const [step, setStep] = useState(initial ? 1 : 0);
  const [cities, setCities] = useState<string[]>(['โตเกียว', 'เกียวโต']);
  const [party, setParty] = useState(4);
  const [character, setCharacter] = useState('shiba');
  const [ticket, setTicket] = useState('');

  const parsed = ticket.trim().length > 40;

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
              : entry === 'city'
                ? 'อยากไปเมืองไหน'
                : 'วางข้อความตั๋วมาเลย'}
          </h1>

          <div className="mt-5 space-y-4">
            {entry === 'ticket' ? (
              <>
                <textarea
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  rows={6}
                  placeholder="วางอีเมลยืนยันตั๋ว หรือข้อความจากสายการบินได้เลย"
                  className="bg-surface text-espresso nums w-full rounded-2xl p-3.5 text-xs outline-none"
                />
                <Button variant="soft" size="sm" onClick={() => setTicket(SAMPLE_TICKET)}>
                  ใส่ตัวอย่างให้ดู
                </Button>

                {parsed ? (
                  <Card accent="matcha" className="animate-rove-rise p-4">
                    <p className="section-label mb-2">อ่านออกมาได้แบบนี้</p>
                    <ul className="text-espresso space-y-1.5 text-xs">
                      <li>✈️ ขาไป TG 682 · BKK → HND · 15 พ.ย. 2569 07:05</li>
                      <li>✈️ ขากลับ TG 673 · KIX → BKK · 22 พ.ย. 2569 12:20</li>
                      <li>👥 4 คน · 8 วัน 7 คืน</li>
                    </ul>
                    <p className="text-muted mt-2 text-[11px]">
                      บินเข้าโตเกียว ออกโอซาก้า — ROVE จะวางแพลนแบบเดินทางข้ามเมืองให้
                    </p>
                  </Card>
                ) : null}
              </>
            ) : null}

            {entry === 'date' ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="ไปวันที่">
                  <input
                    type="date"
                    defaultValue="2026-11-15"
                    className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
                  />
                </Field>
                <Field label="กลับวันที่">
                  <input
                    type="date"
                    defaultValue="2026-11-22"
                    className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
                  />
                </Field>
              </div>
            ) : null}

            {entry !== 'ticket' ? (
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
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            เลือกตัวละครของคุณ
          </h1>
          <p className="text-muted mt-1 text-sm">
            เพื่อนในทริปจะเห็นตัวนี้แทนรูปโปรไฟล์ เปลี่ยนทีหลังได้
          </p>

          <div className="mt-5 grid grid-cols-5 gap-2">
            {CHARACTERS.map((c) => (
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
                {entry === 'ticket'
                  ? '15–22 พ.ย. 2569'
                  : entry === 'date'
                    ? '15–22 พ.ย. 2569'
                    : `${cities.length * 3 + 1} วัน`}
              </Badge>
              {cities.map((c) => (
                <Badge key={c} tone="sky">
                  {c}
                </Badge>
              ))}
              <Badge tone="matcha">{party} คน</Badge>
            </div>
          </Card>

          <Button block size="lg" className="mt-6" onClick={() => router.push('/t/demo')}>
            <RoveMark className="size-4" /> สร้างห้องทริป
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
