'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, MessageCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useInviteMember } from '@/features/trip/queries';
import { mockSkips } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Invite dialog (M2 — W2.4).
 *
 * One link, one role. There is no e-mail field on purpose: these groups live
 * in a LINE chat, and the link is what actually gets pasted there.
 */
export function InviteDialog({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const invite = useInviteMember(tripId);
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [copied, setCopied] = useState(false);
  const link = invite.data?.url ?? '';

  // A role change invalidates the link that is on screen, so mint a new one.
  useEffect(() => {
    if (open) invite.mutate(role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the input below is still selectable.
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ชวนเพื่อนเข้าทริป"
      description="ส่งลิงก์นี้ในแชทกลุ่มได้เลย ใครกดก็เข้าห้องนี้"
    >
      <div className="space-y-4">
        <div className="bg-surface flex rounded-full p-1">
          {(
            [
              { key: 'editor', label: 'แก้ไขได้' },
              { key: 'viewer', label: 'ดูอย่างเดียว' },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              onClick={() => setRole(option.key)}
              className={cn(
                'font-display flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                role === option.key ? 'bg-espresso text-bg' : 'text-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Card className="p-3">
          <p className="section-label mb-1.5">ลิงก์เชิญ</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={invite.isPending ? 'กำลังสร้างลิงก์…' : link}
              onFocus={(e) => e.currentTarget.select()}
              className="bg-bg text-espresso min-w-0 flex-1 rounded-full px-3 py-2 text-[11px] outline-none"
            />
            <Button size="sm" onClick={() => void copy()} disabled={!link}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </Button>
          </div>
          {invite.data ? (
            <p className="text-muted mt-2 text-[11px]">
              ลิงก์หมดอายุ {new Date(invite.data.expiresAt).toLocaleDateString('th-TH')} · สร้างใหม่ได้ตลอด
            </p>
          ) : null}
        </Card>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone="sky">
            <Link2 className="size-3" /> ใครมีลิงก์ก็เข้าได้
          </Badge>
          {mockSkips.notifications ? (
            <Badge tone="sun">
              <MessageCircle className="size-3" /> โหมดทดลอง: ยังไม่ส่งแจ้งเตือนเข้า LINE
            </Badge>
          ) : null}
        </div>

        <p className="text-muted text-xs leading-relaxed">
          พอเพื่อนเข้ามาแล้ว ให้เขาไปแท็บ <strong className="text-espresso">วันเดินทาง</strong>{' '}
          แล้วแตะวันที่ตัวเองว่าง — ระบบจะหาช่วงที่ทุกคนตรงกันให้เอง
        </p>
      </div>
    </Sheet>
  );
}
