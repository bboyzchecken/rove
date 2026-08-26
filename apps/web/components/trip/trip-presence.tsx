'use client';

import { CharacterAvatar } from '@/components/ui/character-avatar';
import type { Member, PresenceMember } from '@/lib/data';

/**
 * Who else is in this room right now (W9.3) — presentation only.
 *
 * The subscription lives in TripRealtime, which owns the room's single SSE
 * connection: presence really does ride that stream rather than opening a
 * second one. Nothing is stored either — someone who closes their laptop just
 * stops appearing, so there is no disconnect to handle.
 */
export function TripPresence({
  others,
  members,
}: {
  others: PresenceMember[];
  members: Member[];
}) {
  if (others.length === 0) return null;

  const typing = others.filter((o) => o.typing);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'สมาชิก';

  return (
    <div className="flex items-center gap-2 px-4 pb-1">
      <span className="flex -space-x-1.5">
        {others.slice(0, 4).map((member) => (
          <CharacterAvatar
            key={member.memberId}
            characterId={members.find((m) => m.id === member.memberId)?.characterId ?? 'shiba'}
            size="xs"
          />
        ))}
      </span>
      <span className="text-muted text-[11px]">
        {typing.length > 0
          ? `${typing.map((t) => nameOf(t.memberId)).join(', ')} กำลังพิมพ์…`
          : `${others.length} คนกำลังดูห้องนี้อยู่`}
      </span>
    </div>
  );
}
