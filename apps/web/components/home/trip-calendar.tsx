'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { WEEKDAYS_TH } from '@/components/ui/month-grid';
import type { CalendarTrip, PastTrip } from '@/lib/data';
import { countryName, flagOf } from '@/lib/data/countries';
import {
  THAI_MONTHS,
  THAI_MONTHS_SHORT,
  addDays,
  monthDates,
  monthOfIso,
  monthStartDow,
  parseIsoDate,
  shiftMonth,
  thaiRangeLabel,
  toIsoDate,
} from '@/lib/data/domain';
import { TRIP_COLOR_HEX, tripColorClasses } from '@/lib/trip-color';
import { cn } from '@/lib/utils';

/**
 * ปฏิทินทริป (Feedback #2 — F2.4, หน้า 10–11, เสียง 2:08–3:36).
 *
 * The progress bars that stood here said what the list above already said.
 * The tester wanted to SEE the year: "อยากได้ทั้ง 2 แบบ คือดูเป็นเดือนได้
 * และดูเป็นปีได้". So:
 *
 *   year   twelve small months, a bar in the trip's colour across its days,
 *          labelled with WHERE (flag + city) rather than the title (3:19 —
 *          a title does not fit and a place is what you scan a year for)
 *   month  one full month, the same bars across the days, labelled with the
 *          trip's title now that there is room
 *
 * Tap a month in the year to open it; tap a bar to open the room. Trips that
 * are over are on it too, in their colour — a year calendar with only the
 * future on it would be most of a year of blank.
 */
interface Bar {
  id: string;
  title: string;
  place: string;
  startDate: string;
  endDate: string;
  color: CalendarTrip['color'];
  href: string;
}

function toBars(upcoming: CalendarTrip[], past: PastTrip[]): Bar[] {
  const out: Bar[] = upcoming.map((trip) => ({
    id: trip.id,
    title: trip.title,
    place: placeOf(trip.country, trip.cities),
    startDate: trip.startDate,
    endDate: trip.endDate,
    color: trip.color,
    href: `/t/${trip.id}`,
  }));
  for (const trip of past) {
    if (out.some((bar) => bar.id === trip.id)) continue;
    out.push({
      id: trip.id,
      title: trip.title,
      place: placeOf(trip.country, trip.cities),
      startDate: addDays(trip.endDate, -Math.max(0, trip.days - 1)),
      endDate: trip.endDate,
      color: trip.color,
      href: `/recap/${trip.id}`,
    });
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** "🇯🇵 โตเกียว" — country and city, never the title, in the year view. */
function placeOf(country: string, cities: string[]) {
  const flag = flagOf(country);
  const where = cities[0] ?? countryName(country);
  return [flag, where].filter(Boolean).join(' ');
}

function overlaps(bar: Bar, from: string, to: string) {
  return bar.startDate <= to && bar.endDate >= from;
}

export function TripCalendar({ upcoming, past }: { upcoming: CalendarTrip[]; past: PastTrip[] }) {
  const bars = useMemo(() => toBars(upcoming, past), [upcoming, past]);
  const today = toIsoDate(new Date());

  // Open on the year of the nearest trip ahead, which is what someone opens a
  // trip calendar to look at; today's year when there is none.
  const initialMonth = upcoming[0]?.startDate ?? today;
  const [view, setView] = useState<'year' | 'month'>('year');
  const [year, setYear] = useState(() => parseIsoDate(initialMonth).getFullYear());
  const [month, setMonth] = useState(() => monthOfIso(initialMonth));

  return (
    <div className="rounded-brand border-border border p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={view === 'year' ? 'ปีก่อนหน้า' : 'เดือนก่อนหน้า'}
            onClick={() =>
              view === 'year' ? setYear((y) => y - 1) : setMonth((m) => shiftMonth(m, -1))
            }
            className="text-muted hover:bg-surface flex size-8 items-center justify-center rounded-full"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-display text-ink min-w-32 text-center text-sm font-medium">
            {view === 'year'
              ? `ปี ${year + 543}`
              : `${THAI_MONTHS[parseIsoDate(month).getMonth()]} ${parseIsoDate(month).getFullYear() + 543}`}
          </span>
          <button
            type="button"
            aria-label={view === 'year' ? 'ปีถัดไป' : 'เดือนถัดไป'}
            onClick={() =>
              view === 'year' ? setYear((y) => y + 1) : setMonth((m) => shiftMonth(m, 1))
            }
            className="text-muted hover:bg-surface flex size-8 items-center justify-center rounded-full"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="bg-surface flex rounded-full p-1">
          {(
            [
              { key: 'year', label: 'ปี' },
              { key: 'month', label: 'เดือน' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={view === tab.key}
              onClick={() => {
                if (tab.key === 'month' && view === 'year') setMonth(monthOfIso(`${year}-01-01`) === month ? month : firstMonthWithTrip(year, bars) ?? monthOfIso(`${year}-01-01`));
                setView(tab.key);
              }}
              className={cn(
                'font-display rounded-full px-3.5 py-1 text-xs font-medium transition',
                view === tab.key ? 'bg-ink text-bg' : 'text-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'year' ? (
        <YearView
          year={year}
          bars={bars}
          today={today}
          onOpenMonth={(m) => {
            setMonth(m);
            setView('month');
          }}
        />
      ) : (
        <MonthView month={month} bars={bars} today={today} />
      )}
    </div>
  );
}

function firstMonthWithTrip(year: number, bars: Bar[]) {
  const hit = bars.find((bar) => bar.endDate >= `${year}-01-01` && bar.startDate <= `${year}-12-31`);
  if (!hit) return null;
  const start = hit.startDate < `${year}-01-01` ? `${year}-01-01` : hit.startDate;
  return monthOfIso(start);
}

/* ------------------------------------------------------------------ year -- */

function YearView({
  year,
  bars,
  today,
  onOpenMonth,
}: {
  year: number;
  bars: Bar[];
  today: string;
  onOpenMonth: (month: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => {
        const month = toIsoDate(new Date(year, i, 1));
        const dates = monthDates(month);
        const from = dates[0]!;
        const to = dates[dates.length - 1]!;
        const inMonth = bars.filter((bar) => overlaps(bar, from, to));
        const pad = monthStartDow(month);
        const isNow = monthOfIso(today) === month;

        return (
          <button
            key={month}
            type="button"
            onClick={() => onOpenMonth(month)}
            className={cn(
              'hover:bg-surface rounded-2xl p-2 text-left transition',
              isNow && 'ring-ink/20 ring-1',
            )}
            aria-label={`${THAI_MONTHS[i]} ${inMonth.length > 0 ? `${inMonth.length} ทริป` : ''}`}
          >
            <p className="text-ink mb-1.5 text-[11px] font-medium">{THAI_MONTHS_SHORT[i]}</p>
            {/* Seven columns of 6px cells; a covered run reads as one bar. */}
            <div className="grid grid-cols-7 gap-px">
              {Array.from({ length: pad }, (_, p) => (
                <span key={`pad-${p}`} className="h-1.5" />
              ))}
              {dates.map((iso) => {
                const bar = inMonth.find((b) => iso >= b.startDate && iso <= b.endDate);
                const first = bar ? iso === bar.startDate || parseIsoDate(iso).getDay() === 0 : false;
                const last = bar ? iso === bar.endDate || parseIsoDate(iso).getDay() === 6 : false;
                return (
                  <span
                    key={iso}
                    className={cn(
                      'h-1.5',
                      bar ? tripColorClasses(bar.color).solid : 'bg-surface',
                      !bar && 'rounded-sm',
                      first && 'rounded-l-full',
                      last && 'rounded-r-full',
                      iso === today && 'ring-ink ring-1',
                    )}
                  />
                );
              })}
            </div>
            <div className="mt-1.5 space-y-0.5">
              {inMonth.slice(0, 2).map((bar) => (
                <p
                  key={bar.id}
                  className={cn(
                    'text-ink truncate rounded-md px-1.5 py-0.5 text-[10px] leading-tight',
                    tripColorClasses(bar.color).light,
                  )}
                >
                  {bar.place}
                </p>
              ))}
              {inMonth.length > 2 ? (
                <p className="text-muted text-[10px]">+{inMonth.length - 2}</p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- month -- */

function MonthView({ month, bars, today }: { month: string; bars: Bar[]; today: string }) {
  const dates = monthDates(month);
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  const inMonth = bars.filter((bar) => overlaps(bar, from, to));

  // Weeks as rows of seven, so a bar can be drawn once per row with a column
  // span rather than once per day.
  const pad = monthStartDow(month);
  const cells: (string | null)[] = [...Array<null>(pad).fill(null), ...dates];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div>
      <div className="text-muted grid grid-cols-7 text-center text-[11px] font-medium">
        {WEEKDAYS_TH.map((d) => (
          <span key={d} className="pb-1">
            {d}
          </span>
        ))}
      </div>
      {weeks.map((week, w) => {
        const weekFrom = week.find(Boolean) ?? from;
        const weekTo = [...week].reverse().find(Boolean) ?? to;
        const rowBars = inMonth.filter((bar) => overlaps(bar, weekFrom, weekTo));
        return (
          <div key={w} className="border-border border-t">
            <div className="grid grid-cols-7">
              {week.map((iso, i) => (
                <div
                  key={iso ?? `pad-${w}-${i}`}
                  className={cn(
                    'nums flex h-7 items-center justify-center text-[12px]',
                    iso === today ? 'text-ink font-medium' : 'text-muted',
                  )}
                >
                  {iso ? (
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full',
                        iso === today && 'bg-ink text-bg',
                      )}
                    >
                      {parseIsoDate(iso).getDate()}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            {rowBars.length > 0 ? (
              <div className="grid grid-cols-7 gap-y-1 pb-2">
                {rowBars.map((bar) => {
                  const startCol = week.findIndex((iso) => iso !== null && iso >= bar.startDate);
                  const endIndex = week.reduce(
                    (found, iso, index) => (iso !== null && iso <= bar.endDate ? index : found),
                    -1,
                  );
                  const span = Math.max(1, endIndex - startCol + 1);
                  const continues = bar.endDate > weekTo;
                  const continued = bar.startDate < weekFrom;
                  return (
                    <Link
                      key={bar.id}
                      href={bar.href as never}
                      title={`${bar.title} · ${thaiRangeLabel(bar.startDate, bar.endDate)}`}
                      style={{
                        gridColumn: `${startCol + 1} / span ${span}`,
                        backgroundColor: TRIP_COLOR_HEX[bar.color].light,
                        borderLeft: continued ? 'none' : `4px solid ${TRIP_COLOR_HEX[bar.color].solid}`,
                      }}
                      className={cn(
                        'text-ink mx-0.5 block h-6 truncate px-1.5 text-[11px] leading-6 font-medium',
                        continued ? 'rounded-l-none' : 'rounded-l-full',
                        continues ? 'rounded-r-none' : 'rounded-r-full',
                      )}
                    >
                      {continued ? '' : bar.title}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="pb-1" />
            )}
          </div>
        );
      })}
      {inMonth.length === 0 ? (
        <p className="text-muted pt-3 text-center text-xs">ไม่มีทริปในเดือนนี้</p>
      ) : null}
    </div>
  );
}
