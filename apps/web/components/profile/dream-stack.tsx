'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import type { DreamItem } from '@/lib/data';
import { flagOf } from '@/lib/data/countries';
import { tripColorClasses } from '@/lib/trip-color';
import type { TripColor } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Dream Trip, as a stack (Feedback #2 — D-19, F2.7, หน้า 12–13).
 *
 * The pink list is replaced by cards laid over each other like a hand of
 * tickets: each one's head shows above the next, the last one in full, the
 * flag of the country large on the right. The developer argued for the list
 * (7:23) and the tester held out for the stack (8:50) — this is the stack.
 *
 * Tapping any card goes to /dreams, where the whole list and the add sheet
 * live; the dashed box at the bottom is "+ Add More Dream Trip" per the ref.
 */
const ACCENT_COLOR: Record<DreamItem['accent'], TripColor> = {
  primary: 'purple',
  green: 'green',
  blue: 'blue',
  yellow: 'yellow',
  pink: 'pink',
};

/** How much of each card peeks out above the next — the ref shows ~48px. */
const PEEK = 'h-[7.5rem]';
const OVERLAP = '-mt-[4.5rem]';

export function DreamStack({ dreams, limit = 4 }: { dreams: DreamItem[]; limit?: number }) {
  const shown = dreams.slice(0, limit);

  return (
    <div>
      <div className="relative">
        {shown.map((dream, index) => {
          const colors = tripColorClasses(ACCENT_COLOR[dream.accent] ?? 'purple');
          const last = index === shown.length - 1;
          return (
            <Link
              key={dream.id}
              href="/dreams"
              className={cn(
                'rounded-brand relative block overflow-hidden p-4 transition hover:-translate-y-0.5',
                PEEK,
                colors.light,
                index > 0 && OVERLAP,
                // A hairline of the page between cards so the stack reads as
                // separate sheets rather than one tall block (§4: no shadows).
                index > 0 && 'ring-bg ring-2',
              )}
              style={{ zIndex: index + 1 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-ink truncate text-base font-medium">{dream.title}</p>
                  <p className="text-ink/70 mt-0.5 truncate text-xs">{dream.destination}</p>
                  {last && dream.note ? (
                    <p className="text-ink/70 mt-2 line-clamp-2 text-xs leading-relaxed">{dream.note}</p>
                  ) : null}
                </div>
                <span className="text-3xl leading-none" aria-hidden="true">
                  {flagOf(dream.country) || '🌍'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <Link
        href="/dreams"
        className="border-muted/40 text-muted hover:border-ink hover:text-ink mt-2 flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-3 text-xs font-medium transition"
      >
        <Plus className="size-4" /> Add More Dream Trip
      </Link>
      {dreams.length > shown.length ? (
        <p className="text-muted mt-1.5 text-center text-[11px]">
          และอีก {dreams.length - shown.length} ที่ใน &ldquo;ที่อยากไปสักวัน&rdquo;
        </p>
      ) : null}
    </div>
  );
}
