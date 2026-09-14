'use client';

import { useState } from 'react';
import { BookmarkPlus, Check, Compass, ImageUp, Pencil } from 'lucide-react';

import { TripCover } from '@/components/trip/trip-cover';
import { TripCoverSheet } from '@/components/trip/trip-cover-sheet';
import { TripFrameDialog } from '@/components/trip/trip-frame-dialog';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { CharacterStack } from '@/components/ui/character-avatar';
import { useAddDream, useDreams, useMe } from '@/features/auth/queries';
import { useTripOverview } from '@/features/trip/queries';
import { countryName } from '@/lib/data/countries';
import { thaiRangeLabel, toIsoDate } from '@/lib/data/domain';
import { tripColorClasses } from '@/lib/trip-color';
import { cn } from '@/lib/utils';

/**
 * The trip room's masthead (M2 — W2.1), reshaped by Feedback #2 (F3.1).
 *
 * The title is the biggest thing on the page now — display size, in the
 * trip's own colour band — and the status pill sits AFTER it on a desk and on
 * the line under it on a phone (11:41), rather than above it where it read as
 * the heading. The cover keeps the Facebook-style band the tester was fine
 * with; what changed is the upload behind the button (see TripCoverSheet).
 *
 * "เก็บเป็น Dream" (D-19 / F3.2): a trip's destination can be filed into
 * ที่อยากไปสักวัน from here in one tap, which is how a plan that will not
 * happen this year stops being a room that nags and becomes a wish that waits.
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
  const { data: dreams = [] } = useDreams();
  const addDream = useAddDream();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="px-4 pt-3">
        <div className="rounded-brand bg-surface h-44 animate-pulse sm:h-56" />
        <div className="bg-surface mt-3 h-8 w-64 animate-pulse rounded-full" />
      </div>
    );
  }

  const { trip, members, locked } = data;
  const hasDates = Boolean(trip.startDate && trip.endDate);
  const colors = tripColorClasses(trip.color);
  // Trip Mode is offered from the day before departure until the day after the
  // trip ends (W10.6). Any earlier and it is a screen with nothing to say.
  const today = toIsoDate(new Date());
  const travelling =
    hasDates && today >= addDaysIso(trip.startDate, -1) && today <= addDaysIso(trip.endDate, 1);
  // A viewer reads the room but does not dress it — the same rule the API keeps.
  const canEdit = members.find((member) => member.id === me?.id)?.role !== 'viewer';

  const dreamDestination = [countryName(trip.country), trip.cities[0]].filter(Boolean).join(' · ');
  const savedAsDream = dreams.some(
    (dream) => dream.title === trip.title || (dreamDestination && dream.destination === dreamDestination),
  );

  const statusPill = (
    <Badge tone="ink" size="md">
      {STATUS_LABEL[trip.status] ?? 'กำลังวางแพลน'}
    </Badge>
  );

  return (
    <div className="px-4 pt-3">
      <TripCover src={trip.cover} frame="banner" priority className="rounded-brand">
        {canEdit ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="bg-ink text-white absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium"
          >
            <ImageUp className="size-3.5" /> เปลี่ยนรูปปก
          </button>
        ) : null}
      </TripCover>

      {/* The title block wears the trip's colour (D-3) — the same light that
          this trip is on the home screen and the calendar. */}
      <div className={cn('rounded-brand mt-3 p-4', colors.light)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="font-display text-ink text-3xl font-medium tracking-tight sm:text-4xl">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    title="แก้ชื่อและกรอบทริป"
                    className="group inline-flex items-start gap-2 text-left transition hover:opacity-80"
                  >
                    {trip.title}
                    <Pencil
                      className="text-ink/50 group-hover:text-ink mt-2.5 size-4 shrink-0"
                      strokeWidth={2.5}
                    />
                  </button>
                ) : (
                  trip.title
                )}
              </h1>
              {/* After the title from `sm` up… */}
              <span className="hidden sm:inline-flex">{statusPill}</span>
            </div>
            {/* …and on its own line below it on a phone (11:41). */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">{statusPill}</div>

            <p className="text-ink/80 nums mt-1.5 text-sm">
              {hasDates
                ? `${thaiRangeLabel(trip.startDate, trip.endDate)} · ${trip.nights + 1} วัน ${trip.nights} คืน`
                : locked
                  ? thaiRangeLabel(locked.startDate, locked.endDate)
                  : 'กำลังหาวันที่ทุกคนว่างตรงกัน'}
              {trip.cities.length > 0 ? ` · ${trip.cities.join(' · ')}` : ''}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {travelling ? (
                <ButtonLink href={`/t/${tripId}/now` as never} size="sm">
                  <Compass className="size-3.5" />
                  โหมดวันเดินทาง
                </ButtonLink>
              ) : null}
              <button
                type="button"
                disabled={savedAsDream || addDream.isPending}
                onClick={() =>
                  addDream.mutate({
                    title: trip.title,
                    destination: dreamDestination || 'ยังไม่ระบุ',
                    country: trip.country,
                    accent: 'pink',
                  })
                }
                className="bg-bg/70 text-ink hover:bg-bg inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition disabled:opacity-70"
              >
                {savedAsDream ? (
                  <>
                    <Check className="size-3.5" /> อยู่ใน Dream แล้ว
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="size-3.5" /> เก็บเป็น Dream
                  </>
                )}
              </button>
            </div>
          </div>
          <CharacterStack characterIds={members.map((m) => m.characterId)} />
        </div>
      </div>

      <TripCoverSheet
        tripId={tripId}
        trip={trip}
        open={picking}
        onClose={() => setPicking(false)}
      />

      {editing ? (
        <TripFrameDialog tripId={tripId} trip={trip} open onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}
