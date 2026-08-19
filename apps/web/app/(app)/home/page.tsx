import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Receipt, Sparkles, UserPlus } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterStack } from '@/components/ui/character-avatar';
import { formatMoney, formatThaiRange } from '@/lib/format';
import { CURRENT_USER, DREAMS, MEMBERS, PAST_TRIPS, UPCOMING, YEAR_STATS } from '@/lib/mock';

/**
 * Home dashboard (M17 — W17.1 … W17.4).
 *
 * This is the screen that answers "what is ROVE when I am not in a trip?":
 * a countdown to the next one, the year so far, what I already did, and what
 * I still dream of doing.
 */
export const metadata = { title: 'หน้าแรก' };

const MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/** The three things a returning user most often wants to do next. */
const QUICK_ACTIONS = [
  { label: 'ชวนเพื่อนเข้าทริป', href: '/t/demo', icon: UserPlus, accent: 'sky' },
  { label: 'ให้ AI ร่างแพลน', href: '/t/demo/plan', icon: Sparkles, accent: 'matcha' },
  { label: 'บันทึกรายจ่าย', href: '/t/demo/expense', icon: Receipt, accent: 'sun' },
] as const;

const PAST_ACCENTS = ['matcha', 'sky', 'joyfull'] as const;

function characterIds(memberIds: string[]) {
  return memberIds.map((id) => MEMBERS.find((m) => m.id === id)?.characterId ?? 'shiba');
}

export default function HomePage() {
  const next = UPCOMING[0]!;
  const maxMonthDays = Math.max(...YEAR_STATS.monthlyDays, 1);

  return (
    <div className="space-y-8 px-4 py-5">
      {/* ------------------------------------------------------- greeting */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            สวัสดี {CURRENT_USER.name}
          </h1>
          <p className="text-muted mt-1 text-sm">
            อีก {next.daysUntil} วันจะได้ไป{next.cities[0]}แล้ว
          </p>
        </div>
        <Link href="/profile" className="shrink-0">
          <Card accent="sun" className="flex items-center gap-2 px-3 py-2">
            <Sparkles className="text-espresso size-4" />
            <span className="font-display text-espresso text-sm font-extrabold">
              {CURRENT_USER.points.toLocaleString('th-TH')}
            </span>
            <span className="text-muted text-[11px]">แต้ม</span>
          </Card>
        </Link>
      </div>

      {/* --------------------------------------------------- quick actions */}
      <div className="grid grid-cols-3 gap-2.5">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.label} href={action.href}>
            <Card accent={action.accent} className="flex h-full flex-col items-start gap-2 p-3.5">
              <action.icon className="text-espresso size-5" strokeWidth={2.2} />
              <span className="text-espresso text-xs leading-tight font-semibold">
                {action.label}
              </span>
            </Card>
          </Link>
        ))}
      </div>

      {/* --------------------------------------------------- next trip */}
      <section>
        <SectionHeader
          label="ทริปที่กำลังจะถึง"
          action={
            <Link href="/t/demo" className="text-primary text-xs font-semibold">
              เปิดห้องทริป
            </Link>
          }
        />

        <Link href="/t/demo">
          <Card className="shadow-warm overflow-hidden">
            <div className="relative">
              <Image
                src={next.cover}
                alt=""
                width={1200}
                height={800}
                className="h-40 w-full object-cover sm:h-52"
                priority
              />
              <div className="bg-espresso text-bg absolute top-3 left-3 rounded-full px-3 py-1.5 backdrop-blur-sm">
                <span className="font-display text-lg leading-none font-extrabold">
                  {next.daysUntil}
                </span>
                <span className="ml-1 text-[11px]">วัน</span>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-espresso text-lg font-extrabold">{next.title}</p>
                  <p className="text-muted mt-0.5 text-sm">
                    {formatThaiRange(next.startDate, next.endDate)} · {next.cities.join(' · ')}
                  </p>
                </div>
                <CharacterStack characterIds={characterIds(next.memberIds)} />
              </div>

              {next.weather ? (
                <div className="bg-sky/25 mt-3 flex items-center gap-2 rounded-2xl px-3 py-2">
                  <span className="text-lg">{next.weather.icon}</span>
                  <span className="text-espresso text-sm font-medium">
                    {next.weather.high}° / {next.weather.low}°
                  </span>
                  <span className="text-muted text-xs">{next.weather.text}</span>
                </div>
              ) : null}
            </div>
          </Card>
        </Link>
      </section>

      {/* --------------------------------------------------- calendar */}
      <section>
        <SectionHeader label="ปฏิทินทริป" />
        <Card className="p-4">
          <div className="space-y-3">
            {UPCOMING.map((trip) => (
              <div key={trip.id} className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-center">
                  <div className="font-display text-espresso text-lg leading-none font-extrabold">
                    {trip.daysUntil}
                  </div>
                  <div className="text-muted text-[10px]">วัน</div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-espresso truncate text-sm font-semibold">{trip.title}</p>
                    <p className="text-muted shrink-0 text-[11px]">
                      {trip.weather?.icon} {trip.weather?.high}°
                    </p>
                  </div>
                  {/* The bar is the trip's length on a 12-day scale — long trips
                   * read as long without needing a real calendar grid yet. */}
                  <div className="bg-surface mt-1.5 h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary/70 h-full rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          ((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) /
                            86_400_000 /
                            12) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-muted mt-1 text-[11px]">
                    {formatThaiRange(trip.startDate, trip.endDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* --------------------------------------------------- year stats */}
      <section>
        <SectionHeader label={`สรุปปี ${YEAR_STATS.year}`} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Card accent="matcha" className="p-4">
            <Stat value={YEAR_STATS.trips} label="ทริป" />
          </Card>
          <Card accent="sky" className="p-4">
            <Stat value={YEAR_STATS.days} label="วันที่ออกเดินทาง" />
          </Card>
          <Card accent="sun" className="p-4">
            <Stat
              value={YEAR_STATS.countries}
              label="ประเทศ"
              hint={`${YEAR_STATS.places} สถานที่`}
            />
          </Card>
          <Card accent="joyfull" className="p-4">
            <Stat
              value={formatMoney(YEAR_STATS.spentThb, 'THB')}
              label="ใช้ไปทั้งปี"
              hint="รวมทุกทริป"
            />
          </Card>
        </div>

        <Card className="mt-2.5 p-4">
          <div className="flex items-end gap-1.5">
            {YEAR_STATS.monthlyDays.map((days, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={
                    days > 0
                      ? 'bg-primary w-full rounded-t-md'
                      : 'bg-surface w-full rounded-t-md'
                  }
                  style={{ height: `${8 + (days / maxMonthDays) * 40}px` }}
                  title={`${MONTHS[i]} · ${days} วัน`}
                />
                <span className="text-muted text-[9px]">{MONTHS[i]!.replace('.', '')}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* --------------------------------------------------- past trips */}
      <section>
        <SectionHeader label="ทริปที่ผ่านมา" />
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {PAST_TRIPS.map((trip, i) => (
            <Card
              key={trip.id}
              accent={PAST_ACCENTS[i % PAST_ACCENTS.length]}
              className="w-64 shrink-0 overflow-hidden"
            >
              <Image
                src={trip.cover}
                alt=""
                width={1200}
                height={800}
                className="h-24 w-full object-cover"
              />
              <div className="p-3">
                <p className="text-espresso text-sm font-bold">{trip.title}</p>
                <p className="text-muted mt-0.5 text-[11px]">{trip.dateLabel}</p>
                <div className="text-muted mt-2 flex items-center justify-between text-[11px]">
                  <span>
                    {trip.days} วัน · {trip.places} ที่
                  </span>
                  <span className="text-espresso font-semibold">
                    {formatMoney(trip.spentThb, 'THB')}
                  </span>
                </div>
                <div className="mt-2">
                  <CharacterStack characterIds={characterIds(trip.memberIds)} size="xs" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- dream list */}
      <section>
        <SectionHeader
          label="ที่อยากไปสักวัน"
          action={
            <Link href="/profile" className="text-primary text-xs font-semibold">
              ดูทั้งหมด {DREAMS.length}
            </Link>
          }
        />
        <div className="space-y-2">
          {DREAMS.slice(0, 3).map((dream) => (
            <Card key={dream.id} accent={dream.accent} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-espresso truncate text-sm font-semibold">{dream.title}</p>
                <p className="text-muted mt-0.5 text-[11px]">{dream.destination}</p>
              </div>
              <ChevronRight className="text-muted size-4 shrink-0" />
            </Card>
          ))}
        </div>
      </section>

      <ButtonLink href="/new" block size="lg">
        เริ่มทริปใหม่ <ArrowRight className="size-4" />
      </ButtonLink>
    </div>
  );
}
