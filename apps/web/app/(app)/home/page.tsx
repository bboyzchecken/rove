'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CalendarDays, Coins, Globe2, Plus, Sparkles } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import { useTrips } from '@/features/trip/queries';
import { useDreams, usePoints, useUserCalendar, useUserStats } from '@/features/user/queries';
import { EntryCards } from '@/components/entry/entry-cards';
import { SiteHeader } from '@/components/common/site-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, SkeletonList } from '@/components/ui/states';
import { track } from '@/lib/analytics';
import { formatDateRange, formatDaysUntil, formatMoney, formatNumber } from '@/lib/format';

/**
 * M17 — the home dashboard.
 *
 * The order answers, in sequence: what is coming up, what have I done, what do
 * I still dream about, and what have I earned. Upcoming trips are first because
 * that is what someone opens the app for.
 */
export default function HomePage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: calendar } = useUserCalendar();
  const { data: stats } = useUserStats();
  const { data: trips, isLoading: tripsLoading } = useTrips();
  const { data: dreams } = useDreams();
  const { data: points } = usePoints();

  useEffect(() => {
    track({ name: 'home_dashboard_viewed' });
    track({ name: 'calendar_viewed' });
  }, []);

  if (meLoading) return <SkeletonList rows={4} />;

  if (!me) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-10">
          <EmptyState
            title="เข้าสู่ระบบก่อนนะ"
            description="ทริปของคุณจะอยู่ตรงนี้ทั้งหมด"
          />
        </main>
      </>
    );
  }

  const upcoming = calendar?.items ?? [];
  const past = (trips?.items ?? []).filter((trip) => trip.status === 'done');
  const topDreams = (dreams?.items ?? []).slice(0, 3);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl space-y-5 px-4 pb-16 pt-5">
        <div>
          <p className="section-label">สวัสดี</p>
          <h1 className="font-display text-2xl">{me.display_name}</h1>
        </div>

        {stats ? (
          <Card tone="primary">
            <CardHeader>
              <CardTitle>ปีนี้ไปมาแล้ว</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="ทริปปีนี้" value={formatNumber(stats.trips_this_year)} unit="ทริป" />
              <Stat label="ทั้งหมด" value={formatNumber(stats.total_trips)} unit="ทริป" />
              <Stat label="รวมกี่วัน" value={formatNumber(stats.total_days)} unit="วัน" />
              <Stat
                label="ใช้ไปแล้ว"
                value={formatMoney(stats.total_spend_thb, 'THB')}
              />
            </div>
            {stats.countries.length > 0 ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-espresso/70">
                <Globe2 className="h-4 w-4" />
                {stats.countries.join(' · ')}
              </p>
            ) : null}
          </Card>
        ) : null}

        <section>
          <h2 className="section-label mb-2">ทริปที่กำลังจะถึง</h2>

          {tripsLoading ? (
            <SkeletonList rows={2} />
          ) : upcoming.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">ยังไม่มีทริปในตาราง — เริ่มวางแผนเลยไหม</p>
              <EntryCards />
            </div>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((entry) => (
                <li key={entry.trip_id}>
                  <Link href={`/t/${entry.trip_id}`}>
                    <Card className="transition-shadow hover:shadow-brand-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-display font-bold text-espresso">
                            {entry.title}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDateRange(entry.start_date, entry.end_date)}
                            {entry.members > 1 ? ` · ${entry.members} คน` : ''}
                          </p>
                          {entry.weather ? (
                            <p className="mt-1 line-clamp-1 text-xs text-muted">{entry.weather}</p>
                          ) : null}
                        </div>
                        <Badge tone={entry.days_until <= 7 ? 'primary' : 'neutral'}>
                          {formatDaysUntil(entry.days_until)}
                        </Badge>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 ? (
          <section>
            <h2 className="section-label mb-2">ทริปที่ผ่านมา</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {past.slice(0, 4).map((trip) => (
                <li key={trip.id}>
                  <Link href={`/t/${trip.id}`}>
                    <Card flat tone="sky" className="transition hover:opacity-90">
                      <p className="truncate font-medium text-espresso">{trip.title}</p>
                      <p className="text-sm text-espresso/60">
                        {formatDateRange(trip.start_date, trip.end_date)}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* W15.4 — the dream list gets a slot here so it stays a live list
              rather than something written once and forgotten. */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>ที่ยังอยากไป</CardTitle>
                <CardDescription>เก็บไว้ก่อน แล้วค่อยเริ่มแพลนเมื่อพร้อม</CardDescription>
              </div>
              <Link href="/profile" className="shrink-0 text-sm text-primary hover:underline">
                ดูทั้งหมด
              </Link>
            </CardHeader>

            {topDreams.length === 0 ? (
              <p className="text-sm text-muted">
                ยังไม่มีอะไรในลิสต์ — <Link href="/profile" className="text-primary">เพิ่มที่แรก</Link>
              </p>
            ) : (
              <ul className="space-y-1.5">
                {topDreams.map((dream) => (
                  <li key={dream.id} className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-espresso">{dream.title}</span>
                    {dream.destination_city ? (
                      <span className="shrink-0 text-xs text-muted">{dream.destination_city}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* W17.4 — points, with the explanation of how to get more. */}
          <Card tone="sun">
            <CardHeader>
              <div>
                <CardTitle>แต้ม ROVE</CardTitle>
                <CardDescription>ใช้เป็นส่วนลดตอนจองทริปตัวเอง</CardDescription>
              </div>
              <Coins className="h-5 w-5 shrink-0 text-espresso/60" />
            </CardHeader>

            <p className="font-display text-3xl font-bold text-espresso">
              {formatNumber(points?.balance ?? 0)}
            </p>
            <p className="mt-1 text-sm text-espresso/70">
              {points && points.balance > 0
                ? `สะสมมาแล้วทั้งหมด ${formatNumber(points.lifetime_earned)} แต้ม`
                : 'เปิดทริปเป็นสาธารณะ แล้วถ้ามีคนก๊อปไปจองผ่านลิงก์ คุณจะได้แต้ม'}
            </p>
          </Card>
        </div>

        <Link href="/">
          <Card className="flex items-center justify-center gap-2 border border-dashed border-border bg-transparent py-6 text-sm font-medium text-muted shadow-none hover:text-primary">
            <Plus className="h-4 w-4" />
            สร้างทริปใหม่
          </Card>
        </Link>
      </main>
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-xs text-espresso/60">{label}</p>
      <p className="font-display text-xl font-bold text-espresso">
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-espresso/60">{unit}</span> : null}
      </p>
    </div>
  );
}
