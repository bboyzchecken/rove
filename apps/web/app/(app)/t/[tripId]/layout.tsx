import type { ReactNode } from 'react';
import Image from 'next/image';

import { TripTabs } from '@/components/trip/trip-tabs';
import { Badge } from '@/components/ui/badge';
import { CharacterStack } from '@/components/ui/character-avatar';
import { formatThaiRange } from '@/lib/format';
import { MEMBERS, TRIP } from '@/lib/mock';

/**
 * Trip room shell (M2 — W2.1): cover, frame summary, then the tab strip that
 * every tab renders under. On a phone the tabs scroll horizontally; the app's
 * own bottom bar stays put underneath.
 *
 * The title sits below the cover, not on it: the covers are light illustrations
 * on white, so overlaid text would need a scrim heavy enough to hide the
 * artwork it is sitting on.
 */
export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  await params; // the prototype always renders the demo trip

  return (
    <div>
      <div className="px-4 pt-3">
        <div className="rounded-brand bg-sky/25 overflow-hidden">
          <Image
            src={TRIP.cover}
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
                กำลังวางแพลน
              </Badge>
              <Badge tone="sun" size="md">
                {TRIP.nights + 1} วัน {TRIP.nights} คืน
              </Badge>
            </div>
            <h1 className="font-display text-espresso text-xl font-extrabold tracking-tight sm:text-2xl">
              {TRIP.title}
            </h1>
            <p className="text-muted mt-0.5 text-xs">
              {formatThaiRange(TRIP.startDate, TRIP.endDate)} · {TRIP.cities.join(' · ')}
            </p>
          </div>
          <CharacterStack characterIds={MEMBERS.map((m) => m.characterId)} />
        </div>
      </div>

      <TripTabs tripId={TRIP.id} />

      <div className="px-4 pb-5">{children}</div>
    </div>
  );
}
