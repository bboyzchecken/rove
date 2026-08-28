'use client';

import { SectionHeader, Stat } from '@/components/common/section';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Progress } from '@/components/ui/progress';
import { TripProfileCard } from '@/components/wishlist/trip-profile-card';
import { WishlistBoard } from '@/components/wishlist/wishlist-board';
import { useTripMembers } from '@/features/trip/queries';
import { useCoverage, useWishlist } from '@/features/wishlist/queries';

/** Coverage Board (M3 — W3.3) with the "who has not filled theirs in" nudge (W3.4). */
export function WishlistScreen({ tripId }: { tripId: string }) {
  const { data: items = [] } = useWishlist(tripId);
  const { data: coverage } = useCoverage(tripId);
  const { data: members = [] } = useTripMembers(tripId);

  const pending = members.filter((m) => !m.hasWishlist);
  const uncovered = items.filter((w) => w.coverage !== 'covered');

  return (
    <div className="space-y-7">
      <TripProfileCard tripId={tripId} />

      <section>
        <SectionHeader label="สรุปว่าของใครเข้าแพลนแล้วบ้าง" />
        <Card accent="green" className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={`${coverage?.percent ?? 0}%`} label="เข้าแพลนแล้ว" />
            <Stat
              value={`${coverage?.mustCovered ?? 0}/${coverage?.mustTotal ?? 0}`}
              label="ของที่ต้องไป"
            />
            <Stat value={coverage?.uncovered ?? 0} label="ยังไม่ได้ใส่" />
          </div>
          <Progress value={(coverage?.percent ?? 0) / 100} tone="ink" className="mt-4" />

          {uncovered.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {uncovered.map((item) => (
                <li key={item.id} className="text-ink flex items-center gap-2 text-xs">
                  <CharacterAvatar
                    characterId={
                      members.find((m) => m.id === item.memberId)?.characterId ?? 'shiba'
                    }
                    size="xs"
                  />
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted">
                    {item.coverage === 'partial' ? 'เข้าแพลนแค่บางส่วน' : 'ยังไม่มีในแพลน'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        {pending.length > 0 ? (
          <Card accent="yellow" className="mt-3 flex items-center gap-3 p-3.5">
            <CharacterAvatar characterId={pending[0]!.characterId} size="sm" />
            <p className="text-ink flex-1 text-xs leading-relaxed">
              <span className="font-medium">{pending.map((m) => m.name).join(', ')}</span>{' '}
              ยังไม่ได้ใส่ที่อยากไป — แพลนอาจไม่มีของเขาเลยสักอย่าง
            </p>
          </Card>
        ) : null}
      </section>

      <section>
        <SectionHeader label={`รายการทั้งหมด ${items.length} อย่าง`} />
        <WishlistBoard tripId={tripId} />
      </section>
    </div>
  );
}
