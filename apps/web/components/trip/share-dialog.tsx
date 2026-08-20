'use client';

import { useState } from 'react';
import { Check, Copy, Eye, Globe, Link2, Lock } from 'lucide-react';

import { useSetVisibility } from '@/features/trip/queries';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { TripVisibility } from '@/types/api';

/**
 * W10.1 — sharing, and the pitch for going public.
 *
 * Two things are stated plainly here because they decide whether someone
 * publishes: expense is never visible to outsiders (§4.3, and it is structural,
 * not a toggle), and a public trip earns its author points when a stranger
 * clones and books from it (§1).
 */

const options: Array<{
  key: TripVisibility;
  icon: typeof Lock;
  title: string;
  description: string;
}> = [
  {
    key: 'private',
    icon: Lock,
    title: 'ส่วนตัว',
    description: 'เห็นเฉพาะคนในห้องนี้',
  },
  {
    key: 'link',
    icon: Link2,
    title: 'ใครมีลิงก์ก็ดูได้',
    description: 'ส่งให้พ่อแม่หรือเพื่อนดูได้ แต่ไม่ขึ้นในหน้าค้นหา',
  },
  {
    key: 'public',
    icon: Globe,
    title: 'เปิดสาธารณะ',
    description: 'ขึ้นในหน้าทริปสาธารณะ ใครก๊อปไปแล้วจองผ่านลิงก์ คุณได้แต้ม',
  },
];

export function ShareDialog({
  tripId,
  open,
  onClose,
  visibility,
  shareToken,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
  visibility: TripVisibility;
  shareToken: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const setVisibility = useSetVisibility(tripId);

  const current = setVisibility.data?.visibility ?? visibility;
  const token = setVisibility.data?.share_token ?? shareToken;
  const shareUrl =
    setVisibility.data?.share_url ??
    (token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${token}` : '');

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Selectable input below is the fallback.
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="แชร์ทริปนี้"
      description="เลือกว่าใครเห็นได้บ้าง"
      footer={<Button onClick={onClose}>เสร็จแล้ว</Button>}
    >
      <div className="space-y-2">
        {options.map((option) => {
          const active = current === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              disabled={setVisibility.isPending}
              onClick={() => setVisibility.mutate(option.key)}
              className={cn(
                'flex w-full items-start gap-3 rounded-brand p-3 text-left transition-colors',
                active ? 'bg-primary/12 ring-1 ring-primary/30' : 'hover:bg-espresso/4',
              )}
            >
              <option.icon
                className={cn('mt-0.5 h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted')}
              />
              <span>
                <span className="block text-sm font-medium text-espresso">{option.title}</span>
                <span className="block text-xs text-muted">{option.description}</span>
              </span>
              {active ? <Check className="ml-auto h-4 w-4 shrink-0 text-primary" /> : null}
            </button>
          );
        })}
      </div>

      {current !== 'private' && shareUrl ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="soft" size="icon" onClick={copy} aria-label="คัดลอกลิงก์">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            คนนอกจะไม่เห็นแท็บรายจ่ายเลย ไม่ว่าตั้งค่ายังไงก็ตาม
          </p>
        </div>
      ) : null}

      {setVisibility.error ? (
        <p className="mt-3 text-sm text-danger">{(setVisibility.error as Error).message}</p>
      ) : null}
    </Dialog>
  );
}
