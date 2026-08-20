'use client';

import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';

import { useCreateInvite } from '@/features/trip/queries';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';

/**
 * W2.4 — the invite dialog. The link is the product: it is generated on open,
 * shown large, and copied with one tap, because "send this to the group chat"
 * is what actually happens next.
 *
 * Email is a fallback for the one person not in the LINE group.
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
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const createInvite = useCreateInvite(tripId);
  const url = createInvite.data?.invite_url;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard is unavailable over plain http or without permission; the
      // input below is selectable, which is the fallback.
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ชวนเพื่อนเข้าทริป"
      description="ส่งลิงก์นี้ในกลุ่มได้เลย ใครกดก็เข้าร่วมได้"
      footer={
        url ? (
          <Button onClick={onClose}>เสร็จแล้ว</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              loading={createInvite.isPending}
              onClick={() =>
                createInvite.mutate({ role, expire_in_days: 14, email: email || undefined })
              }
            >
              สร้างลิงก์
            </Button>
          </>
        )
      }
    >
      {url ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="soft" size="icon" onClick={copy} aria-label="คัดลอกลิงก์">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted">
            ลิงก์นี้ใช้ได้ 14 วัน · ใครที่มีลิงก์เข้าร่วมได้ในสิทธิ์
            {role === 'editor' ? '“แก้ไขได้”' : '“ดูอย่างเดียว”'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="สิทธิ์ของคนที่เข้ามา" hint="เปลี่ยนทีหลังได้ในรายชื่อสมาชิก">
            <Select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">แก้ไขได้ — ใส่ที่อยากไปและแก้แพลนได้</option>
              <option value="viewer">ดูอย่างเดียว — คอมเมนต์ได้ แต่แก้ไม่ได้</option>
            </Select>
          </Field>

          <Field label="ส่งเข้าอีเมลด้วย" hint="ข้ามได้ ถ้าจะส่งลิงก์เองในกลุ่ม">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
            />
          </Field>

          {createInvite.error ? (
            <p className="text-sm text-danger">{(createInvite.error as Error).message}</p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Link2 className="h-3.5 w-3.5" />
              ยังไม่ได้สร้างลิงก์จนกว่าจะกดปุ่ม
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
