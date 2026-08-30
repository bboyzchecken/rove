'use client';

import Link from 'next/link';
import { Copy as CopyIcon, Eye, Sparkles, Users } from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { useAudience } from '@/features/rewards/queries';

/**
 * คนตามรอยฉัน (M23 — W23.2).
 *
 * These numbers existed before this card did — on `/u/[handle]`, the *public*
 * creator page. Which meant the only way to find out how your own plans were
 * doing was to remember your handle and go read your own profile as a stranger
 * would. This is the same data for the person it belongs to, per trip, joined
 * to what each one paid.
 *
 * Renders nothing until something has been published: an audience card with no
 * audience is an accusation, and the creator page already does the inviting.
 */
export function AudienceCard() {
  const { data: audience, isLoading } = useAudience();

  if (isLoading) {
    return (
      <section>
        <SectionHeader label="คนตามรอยฉัน" />
        <div className="rounded-brand bg-surface h-32 animate-pulse" />
      </section>
    );
  }
  if (!audience || audience.publicTrips === 0) return null;

  const top = audience.trips.find((trip) => trip.tripId === audience.topTripId);

  return (
    <section>
      <SectionHeader label="คนตามรอยฉัน" />

      <Card accent="gray" className="p-4">
        <p className="text-ink flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" />
          แพลนสาธารณะ {audience.publicTrips.toLocaleString('th-TH')} ใบ
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={audience.totalViews.toLocaleString('th-TH')} label="คนเปิดดู" />
          <Stat value={audience.totalClones.toLocaleString('th-TH')} label="คนเที่ยวตาม" />
          <Stat
            value={audience.pointsEarned.toLocaleString('th-TH')}
            label="แต้มจากการตามรอย"
          />
        </div>

        {top && top.clones > 0 ? (
          <p className="text-muted mt-3 text-[11px] leading-relaxed">
            ถูกตามรอยมากที่สุดคือ <span className="text-ink font-medium">{top.title}</span> —{' '}
            {top.clones.toLocaleString('th-TH')} คน
          </p>
        ) : null}
      </Card>

      <Card className="divide-border mt-3 divide-y">
        {audience.trips.map((trip) => (
          <div key={trip.tripId} className="flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              {trip.slug ? (
                <Link
                  href={`/p/${trip.slug}` as never}
                  className="text-ink truncate text-sm font-medium hover:underline"
                >
                  {trip.title}
                </Link>
              ) : (
                <p className="text-ink truncate text-sm font-medium">{trip.title}</p>
              )}
              <p className="text-muted mt-0.5 flex items-center gap-2.5 text-[11px]">
                <span className="nums inline-flex items-center gap-1">
                  <Eye className="size-3" /> {trip.views.toLocaleString('th-TH')}
                </span>
                <span className="nums inline-flex items-center gap-1">
                  <CopyIcon className="size-3" /> {trip.clones.toLocaleString('th-TH')}
                </span>
              </p>
            </div>

            {trip.pointsEarned > 0 ? (
              <span className="text-success nums inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                <Sparkles className="size-3.5" />+{trip.pointsEarned.toLocaleString('th-TH')}
              </span>
            ) : (
              // Copies and awards are not the same number — copying your own
              // trip pays nothing — so a plan with reach but no points says so
              // rather than showing a bare zero next to a count.
              <span className="text-muted/70 shrink-0 text-[11px]">ยังไม่ได้แต้มจากใบนี้</span>
            )}
          </div>
        ))}
      </Card>

      {audience.totalClones > audience.trips.reduce((sum, t) => sum + t.awardedClones, 0) ? (
        <p className="text-muted/70 mt-2 text-[11px] leading-relaxed">
          ยอดคนเที่ยวตามนับทุกคนที่ก๊อปแพลนไป ส่วนแต้มจ่ายเฉพาะตอนคนอื่นก๊อป — ก๊อปทริปตัวเองไม่ได้แต้ม
        </p>
      ) : null}
    </section>
  );
}
