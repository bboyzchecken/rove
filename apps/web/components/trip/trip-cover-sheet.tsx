'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ImageUp, Loader2, Move } from 'lucide-react';

import { TripCover } from '@/components/trip/trip-cover';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useUpdateTrip } from '@/features/trip/queries';
import { COVER_HEIGHT, COVER_WIDTH, COVERS } from '@/lib/covers';
import { mockSkips } from '@/lib/data';
import type { Trip } from '@/lib/data';
import {
  COVER_ACCEPT,
  COVER_MAX_FILE_BYTES,
  cropCover,
  decodeCover,
  formatBytes,
} from '@/lib/image';
import type { CoverFocus, DecodedCover, PreparedCover } from '@/lib/image';
import { cn } from '@/lib/utils';

/**
 * Choosing the trip's cover (M2 — W2.3), reworked for Feedback #2 (D-14).
 *
 * The tester could not upload a cover in UAT round 1 (10:06–11:40). Three
 * things changed in answer, all on the upload path rather than the mechanism
 * the tester was fine with:
 *
 *   1. the file input takes any image the phone offers (HEIC included), the
 *      decode honours EXIF orientation, and a failure names the format
 *      instead of saying "ลองไฟล์อื่น" — see lib/image.ts
 *   2. the recommended size and ratio are printed BEFORE the button, not
 *      after an error
 *   3. after a photo is chosen it can be dragged inside the 3:2 frame to
 *      choose what the crop keeps, and the crop is only encoded on save
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
  /** The photo, decoded once; re-cropped as the focus moves. */
  const [decoded, setDecoded] = useState<DecodedCover | null>(null);
  const [focus, setFocus] = useState<CoverFocus>({ x: 0.5, y: 0.5 });
  const [uploaded, setUploaded] = useState<PreparedCover | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Release the bitmap and the object URL when the sheet goes away.
  useEffect(() => () => decoded?.close(), [decoded]);

  const usingUpload = uploaded !== null && selected === uploaded.src;
  const changed = selected !== trip.cover;

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const next = await decodeCover(file);
      decoded?.close();
      setDecoded(next);
      setFocus({ x: 0.5, y: 0.5 });
      const cover = cropCover(next, { x: 0.5, y: 0.5 });
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
    let src = selected;
    // The drag only moved the preview; the crop is encoded once, here.
    if (usingUpload && decoded) {
      try {
        const cover = cropCover(decoded, focus);
        setUploaded(cover);
        src = cover.src;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'ย่อรูปไม่สำเร็จ');
        return;
      }
    }
    await update.mutateAsync({ cover: src });
    onDone();
  }

  return (
    <div className="space-y-4">
      {usingUpload && decoded ? (
        <DragFrame decoded={decoded} focus={focus} onChange={setFocus} />
      ) : (
        <TripCover src={selected} frame="banner" className="rounded-brand" />
      )}

      {/* ------------------------------------------------------- upload */}
      {mockSkips.imageUpload ? (
        <div>
          {/* The size and the ratio are said up front (D-14): a person who
              knows the frame is 3:2 picks a landscape photo, and a portrait
              one no longer arrives as a surprise crop. */}
          <p className="text-muted mb-2 text-[11px] leading-relaxed">
            แนะนำ {COVER_WIDTH} × {COVER_HEIGHT} px (แนวนอน 3:2) · JPG PNG HEIC หรือ WebP · ไฟล์ไม่เกิน{' '}
            {Math.round(COVER_MAX_FILE_BYTES / 1024 / 1024)}MB — รูปใหญ่กว่านี้ระบบย่อให้
            แล้วลากจัดตำแหน่งได้ก่อนบันทึก
          </p>
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
                <Loader2 className="size-4 animate-spin" /> กำลังอ่านรูป…
              </>
            ) : (
              <>
                <ImageUp className="size-4" /> อัปโหลดรูปเอง
              </>
            )}
          </Button>
          {uploaded ? (
            <p className="text-muted/70 mt-1.5 text-[11px]">
              รูปที่อัปโหลดไว้ {formatBytes(uploaded.bytes)}
              {decoded ? ` · ต้นฉบับ ${decoded.width} × ${decoded.height} px` : ''}
            </p>
          ) : null}
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

/**
 * The 3:2 frame with the photo behind it, draggable on whichever axis has
 * spare pixels. The preview is the object URL positioned with CSS; the real
 * crop happens on save with the same focus, so what is seen is what is kept.
 */
function DragFrame({
  decoded,
  focus,
  onChange,
}: {
  decoded: DecodedCover;
  focus: CoverFocus;
  onChange: (focus: CoverFocus) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; focus: CoverFocus } | null>(null);

  const frameRatio = COVER_WIDTH / COVER_HEIGHT;
  const photoRatio = decoded.width / decoded.height;
  const slidesX = photoRatio > frameRatio;
  const slidesY = photoRatio < frameRatio;

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = { x: event.clientX, y: event.clientY, focus };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || !frame.current) return;
    const box = frame.current.getBoundingClientRect();
    // How many frame-widths the overflow spans decides how far one pixel of
    // drag moves the focus — a barely-wider photo needs a big drag, a
    // panorama a small one.
    const overflowX = slidesX ? box.width * (photoRatio / frameRatio) - box.width : 0;
    const overflowY = slidesY ? box.height * (frameRatio / photoRatio) - box.height : 0;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    onChange({
      x: overflowX > 0 ? clamp(drag.current.focus.x - dx / overflowX) : 0.5,
      y: overflowY > 0 ? clamp(drag.current.focus.y - dy / overflowY) : 0.5,
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div>
      <div
        ref={frame}
        role="img"
        aria-label="ลากเพื่อจัดตำแหน่งรูปปก"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="rounded-brand relative h-44 w-full cursor-move touch-none overflow-hidden select-none sm:h-56"
        style={{
          backgroundImage: `url(${decoded.previewUrl})`,
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `${focus.x * 100}% ${focus.y * 100}%`,
        }}
      >
        <span className="bg-ink/70 text-bg absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]">
          <Move className="size-3" />
          {slidesX ? 'ลากซ้าย-ขวา' : slidesY ? 'ลากขึ้น-ลง' : 'พอดีกรอบแล้ว'}
        </span>
      </div>
    </div>
  );
}

function clamp(n: number) {
  return Math.min(1, Math.max(0, n));
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
