'use client';

import { useState } from 'react';
import { ImageDown } from 'lucide-react';

import { usePlanDays } from '@/features/plan/queries';
import { useTrip } from '@/features/trip/queries';
import { env } from '@/lib/env';
import { thaiRangeLabel } from '@/lib/data/domain';
import { drawStoryImage, storyBlob } from '@/lib/story-image';

/**
 * "รูปสรุปทริป" — the square card people post (W10.7).
 *
 * On a phone this hands the PNG to the OS share sheet, which is how a picture
 * gets from here into Instagram; everywhere else it downloads. Both paths draw
 * the same canvas, so what gets posted is what was on screen.
 */
export function StoryCardButton({ tripId }: { tripId: string }) {
  const { data: trip } = useTrip(tripId);
  const { data: days } = usePlanDays(tripId);
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');

  async function make() {
    if (!trip) return;
    setState('working');

    try {
      const items = (days ?? []).flatMap((day) => day.items);
      const canvas = drawStoryImage({
        title: trip.title,
        dateLabel:
          trip.startDate && trip.endDate ? thaiRangeLabel(trip.startDate, trip.endDate) : '',
        days: trip.nights + 1,
        nights: trip.nights,
        cities: trip.cities,
        // What the trip was for: the stops with a real place behind them, not
        // the hotel check-in and the airport transfer.
        highlights: items
          .filter((item) => item.type === 'poi' || item.type === 'meal')
          .map((item) => item.title)
          .slice(0, 5),
        perPersonThb: Math.round(
          items.reduce((sum, item) => sum + (item.costJpy ?? 0), 0) * trip.fxRate,
        ),
        brandName: env.brandName,
      });

      const blob = await storyBlob(canvas);
      const file = new File([blob], `${trip.title}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: trip.title });
        setState('done');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setState('done');
    } catch {
      // A cancelled share sheet lands here too, which is why the copy is
      // "ลองใหม่" rather than an apology for something that broke.
      setState('failed');
    }
  }

  return (
    <div>
      <button
        onClick={() => void make()}
        disabled={!trip || state === 'working'}
        className="rounded-brand bg-surface hover:bg-border flex w-full items-center gap-3 p-3 text-left transition disabled:opacity-50"
      >
        <span className="bg-bg text-muted flex size-9 shrink-0 items-center justify-center rounded-2xl">
          <ImageDown className="size-4" />
        </span>
        <span className="flex-1">
          <span className="text-espresso block text-sm font-semibold">รูปสรุปทริป (1:1)</span>
          <span className="text-muted block text-[11px]">
            {state === 'working' ? 'กำลังวาด…' : 'สำหรับลงสตอรี่หรือฟีด'}
          </span>
        </span>
      </button>

      {state === 'done' ? (
        <p className="text-muted mt-1.5 text-[11px]">ได้รูปแล้ว — เอาไปลงได้เลย</p>
      ) : null}
      {state === 'failed' ? (
        <p className="text-muted mt-1.5 text-[11px]">ยังไม่ได้รูป — ลองใหม่อีกครั้ง</p>
      ) : null}
    </div>
  );
}
