'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { BookOpen, Camera, Loader2, Trash2 } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { PhotoBookSheet } from '@/components/photo/photo-book-sheet';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/features/auth/queries';
import { usePhotos, useRemovePhoto, useUploadPhoto } from '@/features/media/queries';
import { usePlanDays } from '@/features/plan/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { TripPhoto } from '@/lib/data';
import { PHOTO_ACCEPT, photoFromFile } from '@/lib/image';
import { cn } from '@/lib/utils';

/**
 * Photos tab (M18 — W18.1): everything the group shot, grouped by the day it
 * belongs to. Uploads are resized in the browser first, so a phone original
 * never crosses hotel wifi at full size.
 */
export function PhotosScreen({ tripId }: { tripId: string }) {
  const { data: photos = [], isLoading } = usePhotos(tripId);
  const { data: days = [] } = usePlanDays(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const { data: me } = useMe();

  const upload = useUploadPhoto(tripId);
  const [dayFilter, setDayFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [lightbox, setLightbox] = useState<TripPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const shown = photos.filter(
    (p) => (!dayFilter || p.dayId === dayFilter) && (!memberFilter || p.userId === memberFilter),
  );

  // Grouped by day, unassigned ones last — the same order the photo book
  // prints in, so the tab doubles as a preview of the book.
  const groups = days
    .map((day) => ({
      id: day.id,
      label: day.city ? `${day.label} · ${day.city}` : day.label,
      photos: shown.filter((p) => p.dayId === day.id),
    }))
    .filter((group) => group.photos.length > 0);

  const loose = shown.filter((p) => !p.dayId || !days.some((d) => d.id === p.dayId));
  if (loose.length > 0) {
    groups.push({ id: '', label: 'ยังไม่ได้ผูกกับวันไหน', photos: loose });
  }

  const pickFile = async (file: File) => {
    setError(null);
    try {
      const resized = await photoFromFile(file);
      upload.mutate({ file: resized, dayId: dayFilter || undefined });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อัปโหลดไม่สำเร็จ');
    }
  };

  // Photo Book V2 asks for a cover and a palette first; the layout is worked
  // out by the renderer from how many pictures each day has.

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <UploadPhotoButton pending={upload.isPending} onPick={pickFile} />

        {photos.length > 0 ? (
          <Button variant="soft" size="sm" onClick={() => setBooking(true)}>
            <BookOpen className="size-3.5" />
            ทำ Photo Book
          </Button>
        ) : null}
      </div>

      {error ? (
        <Card accent="gray" className="p-3.5">
          <p className="text-danger text-xs">{error}</p>
        </Card>
      ) : null}

      {photos.length > 0 ? (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          <FilterChip
            active={!dayFilter && !memberFilter}
            onClick={() => {
              setDayFilter('');
              setMemberFilter('');
            }}
          >
            ทั้งหมด {photos.length}
          </FilterChip>

          {days.map((day) => (
            <FilterChip
              key={day.id}
              active={dayFilter === day.id}
              onClick={() => setDayFilter(dayFilter === day.id ? '' : day.id)}
            >
              {day.label}
            </FilterChip>
          ))}

          {members.map((member) => (
            <FilterChip
              key={member.id}
              active={memberFilter === member.id}
              onClick={() => setMemberFilter(memberFilter === member.id ? '' : member.id)}
            >
              {member.name}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface aspect-square animate-pulse rounded-xl" />
          ))}
        </div>
      ) : null}

      {!isLoading && photos.length === 0 ? (
        <Card accent="feature" className="p-8 text-center">
          <Camera className="text-ink mx-auto size-8" strokeWidth={2} />
          <p className="text-ink mt-3 text-sm font-medium">ยังไม่มีรูปในทริปนี้</p>
          <p className="text-muted mx-auto mt-1 max-w-xs text-xs leading-relaxed">
            ถ่ายอะไรมาก็เอามาลงตรงนี้ได้เลย — พอทริปจบค่อยกดทำ Photo Book เก็บไว้อ่านทีหลัง
          </p>
        </Card>
      ) : null}

      {groups.map((group) => (
        <section key={group.id || 'loose'}>
          <SectionHeader label={`${group.label} · ${group.photos.length} รูป`} />
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {group.photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setLightbox(photo)}
                className="bg-surface relative aspect-square overflow-hidden rounded-xl transition hover:opacity-90"
              >
                {photo.url ? (
                  <Image
                    src={photo.url}
                    alt={photo.caption || ''}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 33vw, 25vw"
                    className="object-cover"
                  />
                ) : null}
                <span className="absolute bottom-1 left-1">
                  <CharacterAvatar
                    characterId={members.find((m) => m.id === photo.userId)?.characterId ?? 'shiba'}
                    size="xs"
                  />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {lightbox ? (
        <PhotoLightbox
          tripId={tripId}
          photo={lightbox}
          canDelete={
            lightbox.userId === me?.id ||
            members.find((m) => m.id === me?.id)?.role === 'owner'
          }
          onClose={() => setLightbox(null)}
        />
      ) : null}

      <PhotoBookSheet
        tripId={tripId}
        photos={photos}
        open={booking}
        onClose={() => setBooking(false)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition',
        active ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-border',
      )}
    >
      {children}
    </button>
  );
}

/** The one upload control — this tab and the item strip share it (W18.2). */
export function UploadPhotoButton({
  pending,
  onPick,
  label = 'เพิ่มรูป',
  variant = 'primary',
}: {
  pending: boolean;
  onPick: (file: File) => void;
  label?: string;
  variant?: 'primary' | 'soft';
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button variant={variant} size="sm" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        {pending ? 'กำลังอัปโหลด…' : label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
    </>
  );
}

function PhotoLightbox({
  tripId,
  photo,
  canDelete,
  onClose,
}: {
  tripId: string;
  photo: TripPhoto;
  canDelete: boolean;
  onClose: () => void;
}) {
  const remove = useRemovePhoto(tripId);

  return (
    <Sheet open onClose={onClose} title={photo.caption || 'รูปในทริป'} className="sm:max-w-lg">
      <div className="bg-surface relative aspect-square overflow-hidden rounded-2xl">
        {photo.url ? (
          <Image
            src={photo.url}
            alt={photo.caption || ''}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-contain"
          />
        ) : (
          <p className="text-muted absolute inset-0 flex items-center justify-center px-6 text-center text-xs">
            รูปนี้หายไปหลังรีเฟรช — โหมดทดลองไม่มีที่เก็บไฟล์จริง
          </p>
        )}
      </div>

      {canDelete ? (
        <Button
          variant="ghost"
          size="sm"
          block
          className="mt-3"
          disabled={remove.isPending}
          onClick={() => remove.mutate(photo.id, { onSuccess: onClose })}
        >
          <Trash2 className="size-3.5" />
          ลบรูปนี้
        </Button>
      ) : null}
    </Sheet>
  );
}
