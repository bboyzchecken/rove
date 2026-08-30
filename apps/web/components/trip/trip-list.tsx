'use client';

import Link from 'next/link';
import { CalendarSearch, ChevronRight, Plus } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { SectionHeader } from '@/components/common/section';
import { TripCover } from '@/components/trip/trip-cover';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterStack } from '@/components/ui/character-avatar';
import { usePastTrips } from '@/features/auth/queries';
import { useTrips } from '@/features/trip/queries';
import { thaiRangeLabel } from '@/lib/data/domain';
import { formatMoney } from '@/lib/format';

/**
 * "ทริปของฉัน" — every room this user is in (M17).
 *
 * This tab exists because the bottom bar cannot name a single trip: with two
 * trips in flight, "ทริปนี้" is a guess. The list names them, and the room is
 * one tap deeper.
 */
const STATUS: Record<
  string,
  { label: string; tone: 'outline' | 'feature' | 'active' | 'neutral' }
> = {
  planning: { label: 'กำลังวางแพลน', tone: 'outline' },
  ready: { label: 'พร้อมเดินทาง', tone: 'feature' },
  ongoing: { label: 'กำลังเที่ยว', tone: 'active' },
  done: { label: 'จบทริปแล้ว', tone: 'neutral' },
};

export function TripList() {
  const { data: trips = [], isLoading } = useTrips();
  const { data: past = [] } = usePastTrips();

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-5">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-brand bg-surface h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-7 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-2xl font-medium tracking-tight">
            ทริปของฉัน
          </h1>
          <p className="text-muted mt-1 text-sm">
            {trips.length > 0 ? `${trips.length} ห้องที่กำลังวางแผนอยู่` : 'ยังไม่มีห้องทริป'}
          </p>
        </div>
        <ButtonLink href="/new" size="sm">
          <Plus className="size-4" /> สร้างทริป
        </ButtonLink>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          image="/brand/empty/empty-members.webp"
          title="ยังไม่มีทริป"
          hint="เริ่มจากวันที่ลาได้ จากเมืองที่อยากไป หรือถ้ายังไม่รู้วัน ให้ทุกคนใส่วันว่างก่อนก็ได้"
          action={
            <ButtonLink href="/new" size="lg">
              เริ่มทริปแรก
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const hasDates = Boolean(trip.startDate && trip.endDate);
            const status = STATUS[trip.status] ?? STATUS.planning!;

            return (
              <li key={trip.id}>
                <Link href={`/t/${trip.id}` as never}>
                  <Card className="overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <TripCover
                        src={trip.cover}
                        frame="thumb"
                        className="rounded-brand-sm self-start"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <Badge tone={status.tone}>{status.label}</Badge>
                              {trip.role === 'owner' ? <Badge tone="outline">เจ้าของ</Badge> : null}
                            </div>
                            <p className="font-display text-ink truncate font-medium">
                              {trip.title}
                            </p>
                            <p className="text-muted mt-0.5 truncate text-xs">
                              {hasDates
                                ? `${thaiRangeLabel(trip.startDate, trip.endDate)} · ${trip.nights + 1} วัน`
                                : 'ยังไม่ได้ล็อควัน'}
                              {trip.cities.length > 0 ? ` · ${trip.cities.join(' · ')}` : ''}
                            </p>
                          </div>
                          <ChevronRight className="text-muted mt-1 size-4 shrink-0" />
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <CharacterStack characterIds={trip.characterIds} size="xs" max={4} />
                          {hasDates ? (
                            trip.daysUntil > 0 ? (
                              <span className="text-primary nums text-[11px] font-medium">
                                อีก {trip.daysUntil} วัน
                              </span>
                            ) : null
                          ) : (
                            <span className="text-primary flex items-center gap-1 text-[11px] font-medium">
                              <CalendarSearch className="size-3" /> ไปหาวันที่ตรงกัน
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {past.length > 0 ? (
        <section>
          <SectionHeader
            label={`ทริปที่จบไปแล้ว ${past.length} ทริป`}
            action={<span className="text-muted text-[11px]">แตะเพื่อดูบันทึกทริป</span>}
          />
          <Card className="divide-border divide-y">
            {past.map((trip) => (
              <Link
                key={trip.id}
                href={`/recap/${trip.id}` as never}
                className="flex items-center gap-3 p-3.5"
              >
                <TripCover src={trip.cover} frame="mini" className="rounded-brand-sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-medium">{trip.title}</p>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {trip.dateLabel} · {trip.days} วัน · {trip.places} ที่
                  </p>
                </div>
                <span className="text-ink nums shrink-0 text-xs font-medium">
                  {formatMoney(trip.spentThb, 'THB')}
                </span>
                <ChevronRight className="text-muted size-4 shrink-0" />
              </Link>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
