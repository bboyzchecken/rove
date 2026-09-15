'use client';

import Link from 'next/link';
import { Plus, Receipt, Sparkles } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { SectionHeader } from '@/components/common/section';
import { PlanningList, UpcomingList } from '@/components/home/upcoming-list';
import { TripCalendar } from '@/components/home/trip-calendar';
import { DreamStack } from '@/components/profile/dream-stack';
import { TripCover } from '@/components/trip/trip-cover';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterStack } from '@/components/ui/character-avatar';
import {
  useDreams,
  useMe,
  usePastTrips,
  useUpcomingTrips,
  useYearStats,
} from '@/features/auth/queries';
import { useTrips } from '@/features/trip/queries';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * ทริปของฉัน — the home screen, and since Feedback #2 (D-6) the ONLY list of
 * trips: "สรุปของฉัน" and "ทริปของฉัน" were two tabs showing the same rooms
 * in two shapes, and the tester read that as the same information twice
 * (หน้า 7). `/trips` now redirects here.
 *
 * The order down the page is the tester's (F2.1): what is next, what is still
 * being planned, the year on a calendar, the year in numbers, what is behind
 * us, and what we still dream of. Every trip wears its own colour (D-3) on
 * every one of those, which is how the same trip is recognised from the list
 * to the calendar to the room.
 */
export function HomeScreen() {
  const { data: me } = useMe();
  const { data: upcoming = [], isLoading: loadingUpcoming } = useUpcomingTrips();
  const { data: past = [] } = usePastTrips();
  const { data: stats } = useYearStats();
  const { data: dreams = [] } = useDreams();
  const { data: trips = [], isLoading: loadingTrips } = useTrips();

  // Rooms with no dates yet, and not finished: the "กำลังวางแผน" list.
  const planning = trips.filter((trip) => !trip.startDate && trip.status !== 'done');
  const next = upcoming[0];
  const activeTripId = next?.id ?? planning[0]?.id ?? trips[0]?.id;
  const loading = loadingUpcoming || loadingTrips;
  const nothingYet = !loading && upcoming.length === 0 && planning.length === 0;

  return (
    <div className="space-y-8 px-4 py-5">
      {/* ------------------------------------------------------- greeting
          One line. "อีก 88 วันจะได้ไป…" used to sit under it; the countdown
          now lives on the trip's own bar below (F2.2). */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-ink text-2xl font-medium tracking-tight">
          สวัสดี {me?.name ?? ''}
        </h1>
        <Link href="/profile" className="shrink-0">
          <Card accent="gray" className="flex items-center gap-2 px-3 py-2">
            <Sparkles className="text-ink size-4" />
            <span className="font-display text-ink nums text-sm font-medium">
              {(me?.points ?? 0).toLocaleString('th-TH')}
            </span>
            <span className="text-muted text-[11px]">แต้ม</span>
          </Card>
        </Link>
      </div>

      {/* --------------------------------------------------- quick actions
          The first button opens a NEW trip (F2.2): inviting friends belongs
          inside a room, and the thing a person comes to this screen to start
          is the next trip. */}
      <div className="grid grid-cols-3 gap-2.5">
        <Link href="/new">
          <Card accent="countdown" className="flex h-full flex-col items-start gap-2 p-3.5">
            <Plus className="text-ink size-5" strokeWidth={2.2} />
            <span className="text-ink text-xs leading-tight font-medium">สร้างทริปใหม่</span>
          </Card>
        </Link>
        <Link href={(activeTripId ? `/t/${activeTripId}/plan` : '/new') as never}>
          <Card accent="itinerary" className="flex h-full flex-col items-start gap-2 p-3.5">
            <Sparkles className="text-ink size-5" strokeWidth={2.2} />
            <span className="text-ink text-xs leading-tight font-medium">
              ให้ AI ร่างแพลนทริปที่กำลังจะมาถึง
            </span>
          </Card>
        </Link>
        <Link href={(activeTripId ? `/t/${activeTripId}/expense` : '/new') as never}>
          <Card accent="documents" className="flex h-full flex-col items-start gap-2 p-3.5">
            <Receipt className="text-ink size-5" strokeWidth={2.2} />
            <span className="text-ink text-xs leading-tight font-medium">
              บันทึกรายจ่ายทริปที่กำลังจะมาถึง
            </span>
          </Card>
        </Link>
      </div>

      {/* --------------------------------------------------- upcoming */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-brand bg-surface h-22 animate-pulse" />
          ))}
        </div>
      ) : null}

      {nothingYet ? (
        <EmptyState
          image="/brand/empty/empty-members.webp"
          title="ยังไม่มีทริป"
          hint="รู้แค่วันก็ได้ รู้แค่ตั๋วก็ได้ หรือยังไม่รู้อะไรเลยก็ได้ — เริ่มจากตรงไหนก็เปิดทริปได้"
          action={
            <ButtonLink href="/new" size="lg">
              เริ่มทริปแรก
            </ButtonLink>
          }
        />
      ) : null}

      {upcoming.length > 0 ? (
        <section>
          <SectionHeader
            label="ทริปที่กำลังจะมาถึง"
            action={<span className="text-muted text-[11px]">{upcoming.length} ทริป</span>}
          />
          <UpcomingList trips={upcoming} />
        </section>
      ) : null}

      {/* --------------------------------------------------- planning */}
      {planning.length > 0 ? (
        <section>
          <SectionHeader
            label="กำลังวางแผน"
            action={<span className="text-muted text-[11px]">แตะเพื่อดูว่าเหลืออะไร</span>}
          />
          <PlanningList trips={planning} />
        </section>
      ) : null}

      {/* --------------------------------------------------- calendar */}
      {upcoming.length > 0 || past.length > 0 ? (
        <section>
          <SectionHeader label="ปฏิทินทริป" />
          <TripCalendar upcoming={upcoming} past={past} />
        </section>
      ) : null}

      {/* --------------------------------------------------- year stats
          Four cards, four colours (F2.5 — D-2 lifted the one-colour rule).
          The monthly bar chart is gone: "ตัดไปเลย ไม่สำคัญ" (4:39). */}
      {stats ? (
        <section>
          <SectionHeader label={`สรุปปี ${stats.year}`} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard accent="countdown" value={stats.trips} label="ทริป" />
            <StatCard accent="itinerary" value={stats.days} label="วันที่ออกเดินทาง" />
            <StatCard
              accent="journal"
              value={stats.countries}
              label="ประเทศ"
              hint={`${stats.places} สถานที่`}
            />
            <StatCard
              accent="documents"
              value={formatMoney(stats.spentThb, 'THB')}
              label="ใช้ไปทั้งปี"
              hint="รวมทุกทริป"
            />
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------- past trips
          The same card (D-15 — the tester tried a list and called it "ใช้ยาก
          กว่า"), with the title one step up, the picture down to a third of
          the card, and the figures bigger than their labels (F2.6). */}
      {past.length > 0 ? (
        <section>
          <SectionHeader label="ทริปที่ผ่านมา" />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {past.map((trip) => (
              <Link key={trip.id} href={`/recap/${trip.id}` as never} className="shrink-0">
                <Card accent="gray" className="flex w-72 gap-3 p-3">
                  <TripCover
                    src={trip.cover}
                    frame="thumb"
                    className="rounded-brand-sm w-24 self-start sm:w-24"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-ink truncate text-base font-medium">
                      {trip.title}
                    </p>
                    <p className="text-muted nums mt-0.5 text-[11px]">{trip.dateLabel}</p>
                    <div className="mt-2.5 flex items-start gap-3">
                      <Figure value={trip.days} label="วัน" />
                      <Figure value={trip.places} label="ที่" />
                      <Figure
                        value={formatMoney(trip.spentThb, 'THB')}
                        label="ใช้ไป"
                        className="flex-1"
                      />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <CharacterStack characterIds={trip.characterIds ?? []} size="xs" max={4} />
                      <span className="text-primary text-[11px] font-medium">ดูบันทึกทริป</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------- dream stack */}
      <section>
        <SectionHeader
          label="ที่อยากไปสักวัน"
          action={
            <Link href="/dreams" className="text-primary text-xs font-medium">
              {dreams.length > 0 ? `ดูทั้งหมด ${dreams.length}` : 'เพิ่ม'}
            </Link>
          }
        />
        {dreams.length > 0 ? (
          <DreamStack dreams={dreams} />
        ) : (
          <Link
            href="/dreams"
            className="border-muted/40 text-muted hover:border-ink hover:text-ink flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-4 text-xs font-medium transition"
          >
            <Plus className="size-4" /> Add More Dream Trip
          </Link>
        )}
      </section>
    </div>
  );
}

function StatCard({
  accent,
  value,
  label,
  hint,
}: {
  accent: 'countdown' | 'itinerary' | 'journal' | 'documents';
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <Card accent={accent} className="p-4">
      <div className="font-display text-ink nums text-2xl leading-none font-medium tracking-tight">
        {value}
      </div>
      <div className="text-ink/80 mt-1.5 text-xs font-medium">{label}</div>
      {hint ? <div className="text-ink/60 mt-0.5 text-[11px]">{hint}</div> : null}
    </Card>
  );
}

/** A number bigger than its caption — F2.6's "ตัวเลขให้ใหญ่กว่า label". */
function Figure({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="font-display text-ink nums truncate text-sm leading-none font-medium">
        {value}
      </div>
      <div className="text-muted mt-0.5 text-[10px]">{label}</div>
    </div>
  );
}
