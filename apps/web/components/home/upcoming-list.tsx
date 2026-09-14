'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { CharacterStack } from '@/components/ui/character-avatar';
import { useTripOverview } from '@/features/trip/queries';
import type { CalendarTrip, TripSummary } from '@/lib/data';
import { flagOf } from '@/lib/data/countries';
import { daysBetween, thaiRangeLabel } from '@/lib/data/domain';
import { missingSummary, orderedSteps, progressSummary } from '@/lib/trip-progress';
import { tripColorClasses } from '@/lib/trip-color';
import { cn } from '@/lib/utils';

/**
 * "ทริปที่กำลังจะมาถึง" and "กำลังวางแผน" (Feedback #2 — F2.3, หน้า 8–9,
 * เสียง 0:42–2:08).
 *
 * The big cover card is gone. Every trip is one bar in its own colour, all the
 * same height, nearest first: the countdown on the left as the biggest number
 * on the row, flag and title in the middle, the people on the right. The
 * tester's word was "แท็บ" — a strip you scan, not a poster you admire.
 *
 * Under them, the rooms with no dates yet, in the same bars but with a
 * `Planning` tag where the countdown would be. Tapping one opens it in place
 * and says, briefly, what is still missing — because that is why it is on
 * this list at all (1:52: "อันนี้คือทริปต่อไปที่เราจะทำ").
 */
export function UpcomingList({ trips }: { trips: CalendarTrip[] }) {
  if (trips.length === 0) return null;

  return (
    <ul className="space-y-2">
      {trips.map((trip) => {
        const colors = tripColorClasses(trip.color);
        const days = daysBetween(trip.startDate, trip.endDate);
        const travelling = trip.daysUntil <= 0;

        return (
          <li key={trip.id}>
            <Link href={`/t/${trip.id}` as never} className="block">
              <div
                className={cn(
                  'rounded-brand flex min-h-[5.5rem] items-center gap-3 p-3 transition hover:brightness-[0.98]',
                  colors.light,
                )}
              >
                {/* The countdown, and nothing else, on the left: it is the one
                    number this list exists to show (F2.2 moved it here from
                    under the greeting). */}
                <div className="w-16 shrink-0 text-center">
                  {travelling ? (
                    <div className="font-display text-ink text-sm leading-tight font-medium">
                      กำลัง
                      <br />
                      เที่ยว
                    </div>
                  ) : (
                    <>
                      <div className="font-display text-ink nums text-3xl leading-none font-medium">
                        {trip.daysUntil}
                      </div>
                      <div className="text-ink/70 mt-0.5 text-[10px]">วัน</div>
                    </>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-display text-ink truncate font-medium">
                    {trip.country ? <span className="mr-1">{flagOf(trip.country)}</span> : null}
                    {trip.title}
                  </p>
                  <p className="text-ink/80 nums mt-0.5 text-xs">
                    {thaiRangeLabel(trip.startDate, trip.endDate)} · {days} วัน
                  </p>
                  <p className="text-ink/60 mt-0.5 truncate text-[11px]">
                    {[trip.cities.join(' · '), trip.weather ? `${trip.weather.icon} ${trip.weather.text}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <CharacterStack characterIds={trip.characterIds ?? []} size="xs" max={4} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function PlanningList({ trips }: { trips: TripSummary[] }) {
  if (trips.length === 0) return null;
  return (
    <ul className="space-y-2">
      {trips.map((trip) => (
        <PlanningRow key={trip.id} trip={trip} />
      ))}
    </ul>
  );
}

function PlanningRow({ trip }: { trip: TripSummary }) {
  const [open, setOpen] = useState(false);
  const colors = tripColorClasses(trip.color);
  // Only fetched once the row is opened — a list of five planning rooms must
  // not cost five overview requests on the way to the calendar below it.
  const { data: overview } = useTripOverview(open ? trip.id : '');

  const summary = overview ? progressSummary(overview, orderedSteps(overview.trip.startedWith)) : null;
  const missing = overview ? missingSummary(overview) : [];

  return (
    <li>
      <div className={cn('rounded-brand overflow-hidden', colors.light)}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[5.5rem] w-full items-center gap-3 p-3 text-left"
        >
          <div className="flex w-16 shrink-0 justify-center">
            <Badge tone="ink">Planning</Badge>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-ink truncate font-medium">
              {trip.country ? <span className="mr-1">{flagOf(trip.country)}</span> : null}
              {trip.title}
            </p>
            <p className="text-ink/80 mt-0.5 text-xs">ยังไม่กำหนดวัน</p>
            <p className="text-ink/60 mt-0.5 truncate text-[11px]">
              {trip.cities.length > 0 ? trip.cities.join(' · ') : 'ยังไม่ได้เลือกปลายทาง'}
            </p>
          </div>
          <CharacterStack characterIds={trip.characterIds} size="xs" max={4} />
          <ChevronDown
            className={cn('text-ink/60 size-4 shrink-0 transition', open && 'rotate-180')}
          />
        </button>

        {open ? (
          <div className="bg-bg/70 mx-2 mb-2 rounded-2xl p-3.5">
            {!overview ? (
              <div className="bg-surface h-10 animate-pulse rounded-xl" />
            ) : (
              <>
                <p className="text-ink text-xs font-medium">
                  {trip.cities.length > 0 ? `ปลายทาง: ${trip.cities.join(' · ')}` : 'ยังไม่ได้เลือกปลายทาง'}
                </p>
                {missing.length > 0 ? (
                  <p className="text-muted mt-1 text-xs">{missing.join(' · ')}</p>
                ) : (
                  <p className="text-muted mt-1 text-xs">พร้อมแล้ว รอแค่ล็อควัน</p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted text-[11px]">
                    {summary ? `อีก ${summary.remaining} ขั้นถึงจะพร้อม · ${summary.percent}%` : ''}
                  </span>
                  <ButtonLink href={`/t/${trip.id}` as never} size="sm">
                    เข้าห้องทริป <ArrowRight className="size-3.5" />
                  </ButtonLink>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}
