'use client';

import { useTripActivity } from '@/features/trip/queries';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonList } from '@/components/ui/states';
import { formatRelative } from '@/lib/format';
import type { ActivityLog, PublicUser } from '@/types/api';

/**
 * W2.5 — who changed what. This is the answer to "I opened the plan and
 * something moved": every mutation writes one of these rows (DEV_SPEC §6.2).
 */

const ACTION_LABELS: Record<string, string> = {
  'trip.created': 'สร้างทริปนี้',
  'trip.updated': 'แก้ข้อมูลทริป',
  'member.joined': 'เข้าร่วมทริป',
  'member.removed': 'เอาสมาชิกออก',
  'member.role_changed': 'เปลี่ยนสิทธิ์สมาชิก',
  'wishlist.added': 'เพิ่มที่อยากไป',
  'wishlist.updated': 'แก้ที่อยากไป',
  'wishlist.removed': 'ลบที่อยากไป',
  'plan.generated': 'สร้างแพลนใหม่',
  'plan.updated': 'แก้แพลน',
  'plan.frozen': 'ล็อกแพลนนี้เป็นตัวจริง',
  'item.created': 'เพิ่มรายการในแพลน',
  'item.updated': 'แก้รายการ',
  'item.moved': 'ย้ายรายการ',
  'item.deleted': 'ลบรายการ',
  'comment.created': 'คอมเมนต์',
  'expense.created': 'บันทึกรายจ่าย',
  'expense.updated': 'แก้รายจ่าย',
  'expense.deleted': 'ลบรายจ่าย',
  'prep.updated': 'อัปเดตรายการเตรียมตัว',
  'booking.clicked': 'กดไปหน้าจอง',
  'export.requested': 'ดาวน์โหลดแพลน',
};

export function ActivityFeed({ tripId }: { tripId: string }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTripActivity(tripId);

  if (isLoading) return <SkeletonList rows={4} />;

  const pages = data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const actors: Record<string, PublicUser> = Object.assign({}, ...pages.map((p) => p.actors));

  if (items.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีความเคลื่อนไหว"
        description="พอเริ่มใส่ที่อยากไปหรือแก้แพลน จะเห็นที่นี่ว่าใครทำอะไรบ้าง"
      />
    );
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {items.map((log) => (
          <ActivityRow key={log.id} log={log} actor={actors[log.user_id]} />
        ))}
      </ul>

      {hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          full
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          ดูเพิ่ม
        </Button>
      ) : null}
    </div>
  );
}

function ActivityRow({ log, actor }: { log: ActivityLog; actor?: PublicUser }) {
  const name = actor?.display_name ?? 'ใครบางคน';

  return (
    <li className="flex items-start gap-3 rounded-brand px-2 py-2">
      <Avatar
        name={name}
        avatarUrl={actor?.avatar_url}
        characterId={actor?.character_id}
        size="sm"
      />
      <p className="text-sm text-muted">
        <span className="font-medium text-espresso">{name}</span>{' '}
        {ACTION_LABELS[log.action] ?? log.action}
        <span className="ml-1.5 text-xs">{formatRelative(log.created_at)}</span>
      </p>
    </li>
  );
}
