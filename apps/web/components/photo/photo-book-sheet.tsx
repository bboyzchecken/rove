'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { track } from '@/lib/analytics';
import { repo } from '@/lib/data';
import type { TripPhoto } from '@/lib/data';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/**
 * Photo Book V2 — the two choices worth asking about before printing.
 *
 * Layout is automatic (the API lays each day out from how many pictures it
 * has), so what is left for a person to decide is which photo goes on the
 * cover and what the book looks like. Everything else would be a settings
 * screen nobody finishes.
 */
export function PhotoBookSheet({
  tripId,
  photos,
  open,
  onClose,
}: {
  tripId: string;
  photos: TripPhoto[];
  open: boolean;
  onClose: () => void;
}) {
  const { data: themes } = useQuery({
    queryKey: queryKeys.photoBookThemes(tripId),
    queryFn: () => repo.photos.photoBookThemes(tripId),
    enabled: open,
    // A palette list does not change between two visits to this sheet.
    staleTime: Infinity,
  });

  const [theme, setTheme] = useState('paper');
  const [cover, setCover] = useState('');

  const coverId = cover || photos[0]?.id || '';

  const print = () => {
    track('photobook_export_started', { format: 'print' });
    window.open(
      repo.photos.photoBookUrl(tripId, { theme, coverPhotoId: coverId }),
      '_blank',
      'noopener',
    );
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ทำ Travel Photo Book"
      description="เลือกปกกับโทนสี แล้วสั่งพิมพ์หรือบันทึกเป็น PDF ได้เลย — การจัดหน้าแต่ละวันทำให้อัตโนมัติตามจำนวนรูป"
      footer={
        <Button className="w-full" onClick={print} disabled={photos.length === 0}>
          เปิดหน้าพร้อมพิมพ์
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>โทนของเล่ม</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            {(themes ?? []).map((option) => (
              <button
                key={option.id}
                onClick={() => setTheme(option.id)}
                className={cn(
                  'rounded-brand overflow-hidden p-0 text-center transition',
                  theme === option.id ? 'ring-primary ring-2' : 'ring-border ring-1',
                )}
              >
                {/* The swatch is the palette itself — a name alone tells you
                    nothing about what will come out of the printer. */}
                <span
                  className="flex h-12 items-center justify-center"
                  style={{ background: option.paper, color: option.ink }}
                >
                  <span className="text-xs font-medium">Aa</span>
                  <span
                    className="ml-1.5 inline-block size-2 rounded-full"
                    style={{ background: option.accent }}
                  />
                </span>
                <span className="text-ink block py-1.5 text-[11px] font-medium">
                  {option.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>รูปปก</FieldLabel>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {photos.slice(0, 20).map((photo) => (
              <button
                key={photo.id}
                onClick={() => setCover(photo.id)}
                aria-label="เลือกเป็นรูปปก"
                aria-pressed={photo.id === coverId}
                className={cn(
                  'relative size-16 shrink-0 overflow-hidden rounded-xl transition',
                  photo.id === coverId ? 'ring-primary ring-2' : 'opacity-70 hover:opacity-100',
                )}
              >
                <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
          <p className="text-muted mt-1.5 text-[11px]">รูปที่เลือกเป็นปกจะไม่ถูกใส่ซ้ำในเล่ม</p>
        </div>
      </div>
    </Sheet>
  );
}
