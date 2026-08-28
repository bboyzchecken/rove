'use client';

import { useState } from 'react';
import { Headset } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldLabel, Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useCreateLead, useTripLeads } from '@/features/rewards/queries';
import type { LeadStatus } from '@/lib/data';

/**
 * "ให้เอเจนต์ช่วยจัดให้" (M22 — A12.12).
 *
 * Some groups get to the Bookings tab, look at six partner links, and want a
 * person instead. This sends the trip — dates, party size, budget — to a
 * partner agent and keeps the request visible in the room, because a form that
 * disappears is indistinguishable from one that failed.
 */
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'บันทึกแล้ว',
  sent: 'ส่งให้เอเจนต์แล้ว',
  contacted: 'เอเจนต์ติดต่อกลับแล้ว',
  won: 'จองผ่านเอเจนต์แล้ว',
  lost: 'ปิดคำขอแล้ว',
};

export function AgentHandoffCard({ tripId }: { tripId: string }) {
  const { data: leads } = useTripLeads(tripId);
  const [open, setOpen] = useState(false);

  const latest = leads?.[0];

  return (
    <>
      <Card accent="blue" className="p-4">
        <p className="text-ink flex items-center gap-2 text-sm font-medium">
          <Headset className="size-4" />
          อยากให้คนช่วยจัดให้เลยไหม
        </p>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          ส่งทริปนี้ให้เอเจนต์พาร์ตเนอร์ — วัน จำนวนคน และงบที่ตั้งไว้จะถูกส่งไปด้วย
          แล้วรอเขาติดต่อกลับ
        </p>

        {latest ? (
          <div className="mt-3">
            <Badge tone="outline">{STATUS_LABEL[latest.status]}</Badge>
            <p className="text-muted mt-1.5 text-[11px]">
              ส่งเมื่อ{' '}
              {new Date(latest.createdAt).toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'short',
              })}{' '}
              · ติดต่อ {latest.contactName}
              {latest.simulated ? ' · โหมดทดลอง: ยังไม่ได้ส่งถึงเอเจนต์จริง' : ''}
            </p>
          </div>
        ) : null}

        <Button size="sm" variant="soft" className="mt-3" onClick={() => setOpen(true)}>
          {latest ? 'ส่งคำขอใหม่' : 'ให้เอเจนต์ช่วยจัด'}
        </Button>
      </Card>

      <AgentHandoffSheet tripId={tripId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AgentHandoffSheet({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateLead(tripId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [line, setLine] = useState('');
  const [note, setNote] = useState('');

  const reachable = phone.trim() !== '' || line.trim() !== '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ให้เอเจนต์ช่วยจัดทริปนี้"
      description="ทริป วัน จำนวนคน และงบที่ตั้งไว้จะถูกส่งไปพร้อมกัน — ค่าใช้จ่ายในห้องไม่ถูกส่ง"
      footer={
        <Button
          className="w-full"
          disabled={!name.trim() || !reachable || create.isPending}
          onClick={() =>
            create.mutate(
              {
                contactName: name.trim(),
                contactPhone: phone.trim(),
                contactLine: line.trim(),
                note: note.trim(),
              },
              { onSuccess: onClose },
            )
          }
        >
          {create.isPending ? 'กำลังส่ง…' : 'ส่งคำขอ'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <FieldLabel>ชื่อผู้ติดต่อ</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อเล่นก็ได้" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>เบอร์โทร</FieldLabel>
            <Input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </div>
          <div>
            <FieldLabel>LINE ID</FieldLabel>
            <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="@yourid" />
          </div>
        </div>
        {!reachable ? (
          <p className="text-muted text-[11px]">ใส่อย่างน้อยหนึ่งช่องทาง เอเจนต์จะได้ติดต่อกลับได้</p>
        ) : null}
        <div>
          <FieldLabel>อยากบอกอะไรเพิ่ม</FieldLabel>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น อยากได้ที่พักใกล้สถานี มีเด็กเล็กไปด้วย"
          />
        </div>

        {create.isError ? (
          <p className="text-warning text-xs">ส่งไม่สำเร็จ — ลองใหม่อีกครั้ง</p>
        ) : null}
      </div>
    </Sheet>
  );
}
