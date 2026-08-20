'use client';

import { useState } from 'react';
import { Check, Copy, Download, Eye, Globe, Lock, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useExportTrip, useRotateShareToken, useSetVisibility, useShareState } from '@/features/trip/queries';
import type { ExportFormat, TripVisibility } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Share + export (M10 — W10.1, W10.3).
 *
 * The expense tab is never part of a shared view (W16.5), which is stated here
 * rather than left for someone to discover after they have shared a link.
 */
const OPTIONS: { key: TripVisibility; icon: typeof Lock; label: string; hint: string }[] = [
  { key: 'private', icon: Lock, label: 'ส่วนตัว', hint: 'เฉพาะสมาชิกในห้อง' },
  { key: 'link', icon: Eye, label: 'ใครมีลิงก์', hint: 'เปิดดูได้ แต่แก้ไม่ได้' },
  { key: 'public', icon: Globe, label: 'สาธารณะ', hint: 'ขึ้นหน้าสำรวจ ให้คนอื่นก๊อปไปใช้ได้' },
];

const FORMATS: { key: ExportFormat; label: string; hint: string }[] = [
  { key: 'pdf', label: 'PDF', hint: 'พิมพ์หรือส่งต่อ' },
  { key: 'ics', label: 'ปฏิทิน', hint: 'ใส่ลง Google Calendar' },
  { key: 'json', label: 'ข้อมูลดิบ', hint: 'สำรองไว้เอง' },
];

export function ShareDialog({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: share } = useShareState(tripId);
  const setVisibility = useSetVisibility(tripId);
  const rotate = useRotateShareToken(tripId);
  const exportTrip = useExportTrip(tripId);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function copy() {
    if (!share?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the field below is still selectable.
    }
  }

  async function runExport(format: ExportFormat) {
    const result = await exportTrip.mutateAsync(format);

    if (result.url) {
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      link.click();
      setNote(`ดาวน์โหลด ${result.filename} แล้ว`);
      return;
    }

    // PDF has no file to hand over yet: the print dialog renders the same page.
    if (format === 'pdf') {
      window.print();
      setNote('เปิดหน้าต่างพิมพ์ให้แล้ว — เลือก "บันทึกเป็น PDF" ได้เลย');
      return;
    }

    setNote('ยังสร้างไฟล์ไม่ได้ในโหมดนี้');
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="แชร์ทริปนี้"
      description="ค่าใช้จ่ายจะไม่ถูกแชร์ไปด้วยเสมอ ไม่ว่าตั้งค่าแบบไหน"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const active = share?.visibility === option.key;
            return (
              <button
                key={option.key}
                onClick={() => setVisibility.mutate(option.key)}
                className={cn(
                  'rounded-brand flex w-full items-center gap-3 p-3 text-left transition',
                  active ? 'bg-primary/12 ring-primary ring-2' : 'bg-surface',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-2xl',
                    active ? 'bg-primary text-primary-fg' : 'bg-bg text-muted',
                  )}
                >
                  <option.icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="text-espresso block text-sm font-semibold">{option.label}</span>
                  <span className="text-muted block text-[11px]">{option.hint}</span>
                </span>
                {active ? <Check className="text-primary size-4" strokeWidth={3} /> : null}
              </button>
            );
          })}
        </div>

        {share?.shareUrl ? (
          <Card className="p-3">
            <p className="section-label mb-1.5">ลิงก์สำหรับดู</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={share.shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="bg-bg text-espresso min-w-0 flex-1 rounded-full px-3 py-2 text-[11px] outline-none"
              />
              <Button size="sm" onClick={() => void copy()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rotate.mutate()}
                title="สร้างลิงก์ใหม่ ลิงก์เดิมจะใช้ไม่ได้"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <p className="text-muted mt-2 text-[11px]">
              เปิดดูแล้ว {share.viewCount} ครั้ง · ก๊อปไปใช้ {share.cloneCount} ครั้ง
            </p>
          </Card>
        ) : null}

        <div>
          <p className="section-label mb-2">บันทึกไฟล์</p>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((format) => (
              <button
                key={format.key}
                onClick={() => void runExport(format.key)}
                disabled={exportTrip.isPending}
                className="rounded-brand bg-surface hover:bg-border p-3 text-center transition disabled:opacity-50"
              >
                <Download className="text-muted mx-auto size-4" />
                <span className="text-espresso mt-1.5 block text-xs font-semibold">
                  {format.label}
                </span>
                <span className="text-muted block text-[10px]">{format.hint}</span>
              </button>
            ))}
          </div>
          {note ? <p className="text-muted mt-2 text-[11px]">{note}</p> : null}
        </div>

        <Badge tone="sky">ค่าใช้จ่ายและยอดหารกันไม่เคยอยู่ในลิงก์ที่แชร์</Badge>
      </div>
    </Sheet>
  );
}
