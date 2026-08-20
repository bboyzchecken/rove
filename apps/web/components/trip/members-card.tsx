'use client';

import { useState } from 'react';
import { MoreVertical, UserPlus } from 'lucide-react';

import { useRemoveMember, useSetMemberRole } from '@/features/trip/queries';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import type { MemberView, TripRole } from '@/types/api';

import { InviteDialog } from './invite-dialog';

const ROLE_LABELS: Record<TripRole, string> = {
  owner: 'เจ้าของ',
  editor: 'แก้ไขได้',
  viewer: 'ดูอย่างเดียว',
};

/**
 * W2.2 / W3.4 — the member list, doubling as the "who has not added a wishlist
 * yet" nudge. Naming the person is the point: a count of 2 tells nobody to do
 * anything.
 */
export function MembersCard({
  tripId,
  members,
  myRole,
  meId,
}: {
  tripId: string;
  members: MemberView[];
  myRole: TripRole;
  meId?: string;
}) {
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

  const setRole = useSetMemberRole(tripId);
  const removeMember = useRemoveMember(tripId);
  const isOwner = myRole === 'owner';

  return (
    <Card>
      <CardHeader>
        <CardTitle>สมาชิก ({members.length})</CardTitle>
        {isOwner ? (
          <Button variant="soft" size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" />
            ชวนเพื่อน
          </Button>
        ) : null}
      </CardHeader>

      <ul className="space-y-1">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center gap-3 rounded-brand px-1 py-1.5">
            <Avatar
              name={member.display_name}
              avatarUrl={member.avatar_url}
              characterId={member.character_id}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-espresso">
                {member.display_name}
                {member.user_id === meId ? (
                  <span className="ml-1 text-xs font-normal text-muted">(คุณ)</span>
                ) : null}
              </p>
              <p className="text-xs text-muted">{ROLE_LABELS[member.role]}</p>
            </div>

            {!member.has_wishlist ? (
              <Badge tone="warning">ยังไม่ใส่ที่อยากไป</Badge>
            ) : null}

            {isOwner && member.role !== 'owner' ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`จัดการ ${member.display_name}`}
                onClick={() => setManaging(managing === member.user_id ? null : member.user_id)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {managing ? (
        <div className="mt-3 space-y-2 rounded-brand bg-espresso/4 p-3">
          <Select
            value={members.find((m) => m.user_id === managing)?.role ?? 'editor'}
            onChange={(e) =>
              setRole.mutate({ userId: managing, role: e.target.value as TripRole })
            }
          >
            <option value="editor">แก้ไขได้</option>
            <option value="viewer">ดูอย่างเดียว</option>
            <option value="owner">โอนสิทธิ์เจ้าของให้คนนี้</option>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            full
            className="text-danger"
            loading={removeMember.isPending}
            onClick={() => {
              removeMember.mutate(managing);
              setManaging(null);
            }}
          >
            เอาออกจากทริป
          </Button>
        </div>
      ) : null}

      <InviteDialog tripId={tripId} open={inviting} onClose={() => setInviting(false)} />
    </Card>
  );
}
