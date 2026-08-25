'use client';

import { useState } from 'react';
import { Compass, ImageUp } from 'lucide-react';

import { TripCover } from '@/components/trip/trip-cover';
import { TripCoverSheet } from '@/components/trip/trip-cover-sheet';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { CharacterStack } from '@/components/ui/character-avatar';
import { useMe } from '@/features/auth/queries';
import { useTripOverview } from '@/features/trip/queries';
import { thaiRangeLabel, toIsoDate } from '@/lib/data/domain';

/**
 * The trip room's masthead (M2 — W2.1).
 *
 * The title sits below the cover, not on it: the covers are light
 * illustrations on white, so overlaid text would need a scrim heavy enough to
 * hide the artwork it is sitting on. The one thing that does sit on the cover
 * is the button that changes it — a picture is edited where it is seen, and
 * there is nothing under it to hide.
 */
const STATUS_LABEL: Record<string, string> = {
  planning: 'กำลังวางแพลน',
  ready: 'พร้อมเดินทาง',
  ongoing: 'กำลังเที่ยว',
  done: 'จบทริปแล้ว',
};

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function TripHeader({ tripId }: { tripId: string }) {
  const { data, isLoading } = useTripOverview(tripId);
  const { data: me } = useMe();
  const [picking, setPicking] = useState(false);

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
  // Trip Mode is offered from the day before departure until the day after the
  // trip ends (W10.6). Any earlier and it is a screen with nothing to say.
  const today = toIsoDate(new Date());
  const travelling =
    hasDates && today >= addDaysIso(trip.startDate, -1) && today <= addDaysIso(trip.endDate, 1);
  // A viewer reads the room but does not dress it — the same rule the API keeps.
  const canEdit = members.find((member) => member.id === me?.id)?.role !== 'viewer';

  return (
    <div className="px-4 pt-3">
      <TripCover src={trip.cover} frame="banner" priority className="rounded-brand">
        {canEdit ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="bg-bg/90 text-espresso shadow-warm-sm absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
          >
            <ImageUp className="size-3.5" /> เปลี่ยนรูปปก
          </button>
        ) : null}
      </TripCover>

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

      {travelling ? (
        <ButtonLink href={`/t/${tripId}/now` as never} size="sm" className="mt-3">
          <Compass className="size-3.5" />
          โหมดวันเดินทาง
        </ButtonLink>
      ) : null}

      <TripCoverSheet
        tripId={tripId}
        trip={trip}
        open={picking}
        onClose={() => setPicking(false)}
      />
    </div>
  );
}
