'use client';

import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { CharacterStack } from '@/components/ui/character-avatar';
import { useTripOverview } from '@/features/trip/queries';
import { thaiRangeLabel } from '@/lib/data/domain';

/**
 * The trip room's masthead (M2 — W2.1).
 *
 * The title sits below the cover, not on it: the covers are light
 * illustrations on white, so overlaid text would need a scrim heavy enough to
 * hide the artwork it is sitting on.
 */
const STATUS_LABEL: Record<string, string> = {
  planning: 'กำลังวางแพลน',
  ready: 'พร้อมเดินทาง',
  ongoing: 'กำลังเที่ยว',
  done: 'จบทริปแล้ว',
};

export function TripHeader({ tripId }: { tripId: string }) {
  const { data, isLoading } = useTripOverview(tripId);

  if (isLoading || !data) {
    return (
      <div className="px-4 pt-3">
        <div className="rounded-brand bg-surface h-32 animate-pulse sm:h-44" />
        <div className="bg-surface mt-3 h-6 w-56 animate-pulse rounded-full" />
      </div>
    );
  }

  const { trip, members, locked } = data;
  const hasDates = Boolean(trip.startDate && trip.endDate);

  return (
    <div className="px-4 pt-3">
      <div className="rounded-brand bg-sky/25 overflow-hidden">
        <Image
          src={trip.cover}
          alt=""
          width={1200}
          height={800}
          priority
          className="h-32 w-full object-cover sm:h-44"
        />
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="solid" size="md">
              {STATUS_LABEL[trip.status] ?? 'กำลังวางแพลน'}
            </Badge>
            {hasDates ? (
              <Badge tone="sun" size="md">
                {trip.nights + 1} วัน {trip.nights} คืน
              </Badge>
            ) : (
              <Badge tone="outline" size="md">
                ยังไม่ได้ล็อควัน
              </Badge>
            )}
          </div>
          <h1 className="font-display text-espresso text-xl font-extrabold tracking-tight sm:text-2xl">
            {trip.title}
          </h1>
          <p className="text-muted mt-0.5 text-xs">
            {hasDates
              ? thaiRangeLabel(trip.startDate, trip.endDate)
              : locked
                ? thaiRangeLabel(locked.startDate, locked.endDate)
                : 'กำลังหาวันที่ทุกคนว่างตรงกัน'}
            {trip.cities.length > 0 ? ` · ${trip.cities.join(' · ')}` : ''}
          </p>
        </div>
        <CharacterStack characterIds={members.map((m) => m.characterId)} />
      </div>
    </div>
  );
}
