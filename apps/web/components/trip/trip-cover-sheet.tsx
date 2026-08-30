'use client';

import { useRef, useState } from 'react';
import { Check, ImageUp, Loader2 } from 'lucide-react';

import { TripCover } from '@/components/trip/trip-cover';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useUpdateTrip } from '@/features/trip/queries';
import { COVER_HEIGHT, COVER_WIDTH, COVERS } from '@/lib/covers';
import { mockSkips } from '@/lib/data';
import type { Trip } from '@/lib/data';
import { COVER_ACCEPT, COVER_MAX_FILE_BYTES, coverFromFile, formatBytes } from '@/lib/image';
import type { PreparedCover } from '@/lib/image';
import { cn } from '@/lib/utils';

/**
 * Choosing the trip's cover (M2 — W2.3).
 *
 * The cover is the only picture a trip has: it is what the room opens on, what
 * the trip list shows, and what a shared link previews. It used to be assigned
 * once at creation and never again, so every trip that was not to Japan still
 * looked like it was.
 *
 * Nothing saves on tap. A cover is group-visible and the grid is easy to
 * mis-tap on a phone, so the choice is previewed at the top and only lands
 * when "บันทึก" is pressed.
 */
export function TripCoverSheet({
  tripId,
  trip,
  open,
  onClose,
}: {
  tripId: string;
  trip: Trip;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="รูปปกทริป"
      description="เลือกจากที่มีให้ หรือใส่รูปของกลุ่มเองก็ได้"
      className="sm:max-w-lg"
    >
      {open ? <CoverPicker tripId={tripId} trip={trip} onDone={onClose} /> : null}
    </Sheet>
  );
}

/** Its own component so closing the sheet throws the draft choice away. */
function CoverPicker({ tripId, trip, onDone }: { tripId: string; trip: Trip; onDone: () => void }) {
  const update = useUpdateTrip(tripId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState(trip.cover);
  /** Kept beside the built-ins so it can be re-picked after tapping away. */
  const [uploaded, setUploaded] = useState<PreparedCover | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = selected !== trip.cover;

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const cover = await coverFromFile(file);
      setUploaded(cover);
      setSelected(cover.src);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านไฟล์รูปไม่สำเร็จ');
    } finally {
      setReading(false);
      // Picking the same file twice has to fire onChange the second time too.
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save() {
    if (!changed) return onDone();
    await update.mutateAsync({ cover: selected });
    onDone();
  }

  return (
    <div className="space-y-4">
      <TripCover src={selected} frame="banner" className="rounded-brand" />

      {/* ------------------------------------------------------- upload */}
      {mockSkips.imageUpload ? (
        <div>
          <input
            ref={fileInput}
            type="file"
            accept={COVER_ACCEPT}
            onChange={(event) => void pickFile(event.target.files?.[0])}
            className="hidden"
          />
          <Button
            variant="outline"
            block
            onClick={() => fileInput.current?.click()}
            disabled={reading}
          >
            {reading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> กำลังย่อรูป…
              </>
            ) : (
              <>
                <ImageUp className="size-4" /> อัปโหลดรูปเอง
              </>
            )}
          </Button>
          <p className="text-muted/70 mt-1.5 text-[11px]">
            แนะนำ {COVER_WIDTH} × {COVER_HEIGHT} px (อัตราส่วน 3:2) · JPG PNG หรือ WebP ·
            ไฟล์ไม่เกิน {Math.round(COVER_MAX_FILE_BYTES / 1024 / 1024)}MB
            <br />
            รูปใหญ่กว่านี้ก็ใช้ได้ — ระบบย่อและครอบตรงกลางให้เป็น 3:2 ก่อนบันทึก
            {uploaded ? ` · รูปที่อัปโหลดไว้ ${formatBytes(uploaded.bytes)}` : ''}
          </p>
        </div>
      ) : (
        <p className="text-muted/70 text-[11px]">
          โหมดจริงยังอัปโหลดรูปเองไม่ได้ — ที่เก็บไฟล์ยังไม่ได้ต่อ เลือกจากรูปด้านล่างไปก่อนได้
        </p>
      )}

      {error ? (
        <p className="text-danger text-xs font-medium" role="alert">
          {error}
        </p>
      ) : null}

      {/* ------------------------------------------------------ library */}
      {uploaded ? (
        <Group label="รูปของกลุ่ม">
          <Tile
            src={uploaded.src}
            label="รูปที่อัปโหลด"
            selected={selected === uploaded.src}
            onSelect={() => setSelected(uploaded.src)}
          />
        </Group>
      ) : null}

      <Group label="เลือกตามอารมณ์ทริป">
        {COVERS.filter((cover) => cover.group === 'vibe').map((cover) => (
          <Tile
            key={cover.id}
            src={cover.src}
            label={cover.label}
            selected={selected === cover.src}
            onSelect={() => setSelected(cover.src)}
          />
        ))}
      </Group>

      <Group label="ปลายทางที่วาดไว้แล้ว">
        {COVERS.filter((cover) => cover.group === 'destination').map((cover) => (
          <Tile
            key={cover.id}
            src={cover.src}
            label={cover.label}
            selected={selected === cover.src}
            onSelect={() => setSelected(cover.src)}
          />
        ))}
      </Group>

      {update.isError ? (
        <p className="text-danger text-xs font-medium" role="alert">
          บันทึกรูปปกไม่สำเร็จ ลองใหม่อีกครั้ง
        </p>
      ) : null}

      <div className="pt-1">
        <Button block size="lg" onClick={() => void save()} disabled={update.isPending || reading}>
          {update.isPending ? 'กำลังบันทึก…' : changed ? 'บันทึกรูปปก' : 'ปิด'}
        </Button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted mb-1.5 text-[11px] font-medium">{label}</p>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Tile({
  src,
  label,
  selected,
  onSelect,
}: {
  src: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        'rounded-brand-sm relative overflow-hidden text-left transition',
        selected ? 'ring-primary ring-2' : 'hover:opacity-90',
      )}
    >
      <TripCover src={src} frame="card" />
      <span className="text-ink bg-bg/85 absolute inset-x-0 bottom-0 truncate px-1.5 py-1 text-[10px] font-medium">
        {label}
      </span>
      {selected ? (
        <span className="bg-primary text-primary-fg absolute top-1 right-1 flex size-5 items-center justify-center rounded-full">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}
