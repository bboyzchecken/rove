'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AtSign,
  Award,
  Bell,
  BarChart3,
  CheckCheck,
  Sparkles,
  Undo2,
  UserCheck,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useInbox, useMarkNotificationsRead } from '@/features/community/queries';
import type { Notification, NotificationKind } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * The inbox (M9 — A9.2).
 *
 * Distinct from the activity feed: the feed is what happened in a room and is
 * read by whoever opens it, while this is addressed post — it has a recipient
 * and it can be unread, which is what a badge is allowed to count.
 */
const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  mention: AtSign,
  assigned: UserCheck,
  poll_opened: BarChart3,
  plan_ready: Sparkles,
  points: Award,
  refund: Undo2,
};

export function InboxBell({ className }: { className?: string }) {
  const { data: inbox } = useInbox();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);

  const unread = inbox?.unread ?? 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการที่ยังไม่ได้อ่าน` : 'การแจ้งเตือน'}
        className={cn(
          'text-espresso hover:bg-surface relative flex size-9 items-center justify-center rounded-full transition',
          className,
        )}
      >
        <Bell className="size-4.5" strokeWidth={2.5} />
        {unread > 0 ? (
          <span className="bg-primary text-primary-fg nums absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title="การแจ้งเตือน"
          description={unread > 0 ? `ยังไม่ได้อ่าน ${unread} รายการ` : 'อ่านครบแล้ว'}
        >
          {unread > 0 ? (
            <button
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
              className="text-muted hover:text-espresso mb-3 flex items-center gap-1.5 text-xs font-semibold"
            >
              <CheckCheck className="size-3.5" />
              อ่านทั้งหมด
            </button>
          ) : null}

          {(inbox?.items ?? []).length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-espresso text-sm font-semibold">ยังไม่มีอะไรถึงคุณ</p>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                เวลามีคนทัก @ชื่อคุณ หรือเปิดโพลใหม่ จะมาโผล่ตรงนี้
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {(inbox?.items ?? []).map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={() => {
                    markRead.mutate(notification.id);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </Sheet>
      ) : null}
    </>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const Icon = KIND_ICON[notification.kind] ?? Bell;

  const body = (
    <Card
      accent={notification.read ? 'none' : 'sky'}
      className="flex items-start gap-3 p-3 text-left"
    >
      <span className="bg-bg/70 flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon className="text-espresso size-4" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-espresso block text-xs font-semibold">{notification.title}</span>
        {notification.body ? (
          <span className="text-muted mt-0.5 block line-clamp-2 text-[11px] leading-relaxed">
            {notification.body}
          </span>
        ) : null}
      </span>
      {!notification.read ? (
        <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
      ) : null}
    </Card>
  );

  if (!notification.link) {
    return <li>{body}</li>;
  }

  return (
    <li>
      <Link href={notification.link as never} onClick={onOpen} className="block">
        {body}
      </Link>
    </li>
  );
}
