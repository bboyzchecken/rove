'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CalendarSearch, ChevronRight, Plus } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { SectionHeader } from '@/components/common/section';
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
const STATUS: Record<string, { label: string; tone: 'solid' | 'matcha' | 'sun' | 'neutral' }> = {
  planning: { label: 'กำลังวางแพลน', tone: 'solid' },
  ready: { label: 'พร้อมเดินทาง', tone: 'matcha' },
  ongoing: { label: 'กำลังเที่ยว', tone: 'sun' },
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
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
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
                    <div className="flex gap-3">
                      <Image
                        src={trip.cover}
                        alt=""
                        width={400}
                        height={400}
                        className="size-28 shrink-0 object-cover"
                      />

                      <div className="min-w-0 flex-1 py-3 pr-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <Badge tone={status.tone}>{status.label}</Badge>
                              {trip.role === 'owner' ? (
                                <Badge tone="outline">เจ้าของ</Badge>
                              ) : null}
                            </div>
                            <p className="font-display text-espresso truncate font-bold">
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
                              <span className="text-primary nums text-[11px] font-semibold">
                                อีก {trip.daysUntil} วัน
                              </span>
                            ) : null
                          ) : (
                            <span className="text-primary flex items-center gap-1 text-[11px] font-semibold">
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
          <SectionHeader label={`ทริปที่จบไปแล้ว ${past.length} ทริป`} />
          <Card className="divide-border divide-y">
            {past.map((trip) => (
              <div key={trip.id} className="flex items-center gap-3 p-3.5">
                <Image
                  src={trip.cover}
                  alt=""
                  width={200}
                  height={200}
                  className="rounded-brand-sm size-12 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-espresso truncate text-sm font-semibold">{trip.title}</p>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {trip.dateLabel} · {trip.days} วัน · {trip.places} ที่
                  </p>
                </div>
                <span className="text-espresso nums shrink-0 text-xs font-semibold">
                  {formatMoney(trip.spentThb, 'THB')}
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
