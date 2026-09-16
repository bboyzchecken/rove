'use client';

import { useMemo, useState } from 'react';
import { Flag, Pencil, Search } from 'lucide-react';

import { StatusPill, type StatusTone } from '@/components/admin/ui/status-pill';
import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  useLedgerAdjust,
  useLedgerFlags,
  useResolveFlag,
  useTrace,
} from '@/features/admin/queries';
import type {
  LedgerFlag,
  TraceEarning,
  TraceNode,
  TracePoints,
  TraceType,
} from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * ไล่ที่มาแต้มและรายได้ (Feedback #4 — F12, D-17, D-20, D-36).
 *
 * One search, rendered as the chain it found: roots first, each event with
 * what it held at the time, and the points, earnings, codes and flags hanging
 * off it. Corrections are made from the row they correct, so the adjustment
 * always has a parent.
 */

const TYPES: { value: TraceType; label: string; placeholder: string }[] = [
  { value: 'user', label: 'ผู้ใช้', placeholder: 'user id หรือ @handle' },
  { value: 'points', label: 'แถวแต้ม', placeholder: 'id ของแถวแต้ม' },
  { value: 'earning', label: 'รายได้', placeholder: 'id ของรายได้' },
  { value: 'booking', label: 'การจอง', placeholder: 'id ของการจอง' },
  { value: 'click', label: 'คลิก / tracking id', placeholder: 'id ของคลิก' },
  { value: 'trip', label: 'ทริป', placeholder: 'id ของทริป' },
  { value: 'code', label: 'โค้ดส่วนลด', placeholder: 'เช่น ROVE-K7M2QX' },
  { value: 'source', label: 'หลักฐาน (source id)', placeholder: 'id ของหลักฐาน' },
];

const KIND_LABEL: Record<string, string> = {
  publish: 'เปิดทริปเป็นสาธารณะ',
  clone: 'คัดลอกทริป',
  booking_click: 'กดลิงก์จอง',
  partner_confirmed: 'พาร์ตเนอร์ยืนยันการจอง',
  partner_cancelled: 'พาร์ตเนอร์ยกเลิกการจอง',
  partner_paid: 'พาร์ตเนอร์จ่ายค่าคอมแล้ว',
  referral_join: 'เพื่อนเข้าร่วมจากลิงก์ชวน',
  trip_pass_purchase: 'ซื้อ Trip Pass',
  trip_pass_refund: 'คืนเครดิต Trip Pass',
  booker_credit: 'เครดิตคืนผู้จอง',
  redeem: 'แลกแต้ม',
  admin_adjustment: 'แอดมินแก้ยอด',
  earning_expired: 'รายได้หมดอายุ',
  legacy: 'ข้อมูลเดิม',
};

const EARNING_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'รอยืนยัน', tone: 'wait' },
  payable: { label: 'รอโอน', tone: 'info' },
  in_payout: { label: 'อยู่ในรอบโอน', tone: 'info' },
  paid: { label: 'โอนแล้ว', tone: 'ok' },
  reversed: { label: 'กลับรายการ', tone: 'danger' },
  expired: { label: 'หมดอายุ', tone: 'plain' },
};

const SNAPSHOT_LABEL: Record<string, string> = {
  owner: 'เจ้าของ',
  trip: 'ทริป',
  trip_title: 'ชื่อทริป',
  source_trip: 'ทริปต้นทาง',
  copy_trip: 'ทริปสำเนา',
  points: 'แต้ม',
  partner: 'พาร์ตเนอร์',
  tracking_id: 'tracking id',
  booking: 'การจอง',
  booking_value_thb: 'ยอดจอง (฿)',
  commission_thb: 'ค่าคอม (฿)',
  creator_share_percent: 'ส่วนแบ่งครีเอเตอร์ (%)',
  booker_credit_percent: 'เครดิตคืนผู้จอง (%)',
  creator: 'ครีเอเตอร์',
  booker: 'ผู้จอง',
  cloner: 'คนคัดลอก',
  amount_thb: 'ยอด (฿)',
  amount: 'ยอดที่แก้',
  note: 'บันทึก',
  reason: 'เหตุผล',
  reference: 'อ้างอิง',
  admin: 'แอดมิน',
  target_type: 'ประเภทที่แก้',
  target_id: 'id ที่แก้',
  target_before: 'ก่อนแก้',
};

/** Where a flag's subject is searched from. */
const FLAG_TRACE_TYPE: Record<string, TraceType> = {
  earning: 'earning',
  points: 'points',
  discount_code: 'code',
  booking_click: 'click',
  booking: 'booking',
  trip: 'trip',
  user: 'user',
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TraceScreen() {
  const [draftType, setDraftType] = useState<TraceType>('user');
  const [draftQuery, setDraftQuery] = useState('');
  const [search, setSearch] = useState<{ type: TraceType; query: string }>({
    type: 'user',
    query: '',
  });

  const trace = useTrace(search.type, search.query);

  function run(type: TraceType, query: string) {
    setDraftType(type);
    setDraftQuery(query);
    setSearch({ type, query: query.trim() });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-ink text-2xl font-medium tracking-tight">
          ไล่ที่มาแต้มและรายได้
        </h1>
        <p className="text-muted mt-1 text-sm">
          ค้นหาแล้วระบบไล่ขึ้นไปถึงต้นทาง และลงไปหาทุกอย่างที่เกิดจากมัน
        </p>
      </div>

      <FlagsPanel onTrace={(flag) => run(FLAG_TRACE_TYPE[flag.subjectType] ?? 'source', flag.subjectId)} />

      <section>
        <SectionHeader label="ค้นหา" />
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(draftType, draftQuery);
          }}
        >
          <Select
            aria-label="ค้นจาก"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as TraceType)}
            className="sm:w-52"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Input
            aria-label="คำค้น"
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder={TYPES.find((t) => t.value === draftType)?.placeholder}
          />
          <Button type="submit" size="sm" className="h-auto shrink-0 py-2.5" disabled={!draftQuery.trim()}>
            <Search className="size-4" /> ไล่ที่มา
          </Button>
        </form>
      </section>

      {search.query ? (
        <section>
          <SectionHeader
            label={`ผลการไล่ที่มา · ${TYPES.find((t) => t.value === search.type)?.label} ${search.query}`}
          />
          {trace.isLoading ? (
            <div className="rounded-brand bg-surface h-32 animate-pulse" />
          ) : trace.error ? (
            <div className="rounded-brand bg-surface text-muted p-8 text-center text-sm">
              {trace.error.message}
            </div>
          ) : trace.data ? (
            <TraceTree nodes={trace.data.nodes} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- tree -- */

function TraceTree({ nodes }: { nodes: TraceNode[] }) {
  const { roots, children } = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const byParent = new Map<string, TraceNode[]>();
    const top: TraceNode[] = [];
    const sorted = [...nodes].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (const n of sorted) {
      if (n.parentId && ids.has(n.parentId)) {
        byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
      } else {
        top.push(n);
      }
    }
    return { roots: top, children: byParent };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="rounded-brand bg-surface text-muted p-8 text-center text-sm">
        ไม่พบหลักฐาน
      </div>
    );
  }

  const render = (n: TraceNode) => (
    <li key={n.id}>
      <NodeCard node={n} />
      {children.get(n.id)?.length ? (
        <ul className="border-border mt-3 ml-4 space-y-3 border-l pl-4">
          {children.get(n.id)!.map(render)}
        </ul>
      ) : null}
    </li>
  );

  return <ul className="space-y-4">{roots.map(render)}</ul>;
}

function NodeCard({ node }: { node: TraceNode }) {
  const [adjusting, setAdjusting] = useState<
    { type: 'points'; row: TracePoints } | { type: 'earning'; row: TraceEarning } | null
  >(null);

  return (
    <Card className={cn('space-y-3 p-4', node.matched && 'ring-primary ring-2')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-ink text-sm font-medium">
          {KIND_LABEL[node.kind] ?? node.kind}
        </span>
        <span className="text-muted nums text-xs">{formatWhen(node.occurredAt)}</span>
        {node.matched ? <StatusPill tone="info">ตรงกับที่ค้น</StatusPill> : null}
        {node.legacy ? (
          <StatusPill tone="wait">ข้อมูลก่อนมีระบบหลักฐาน — อาจไม่ครบ</StatusPill>
        ) : null}
      </div>

      <p className="text-muted text-[11px] break-all">
        หลักฐาน {node.id}
        {node.actorUserId ? ` · ผู้ทำ ${node.actorUserId}` : ''}
        {` · ${node.subjectType} ${node.subjectId}`}
        {node.bookingId ? ` · การจอง ${node.bookingId}` : ''}
      </p>

      <SnapshotView snapshot={node.snapshot} />

      {node.trips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {node.trips.map((trip) => (
            <span key={trip.id} className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-ink">{trip.title || trip.id}</span>
              {trip.missing ? (
                <StatusPill tone="danger">ไม่พบทริป</StatusPill>
              ) : trip.archived ? (
                <StatusPill tone="plain">เก็บเข้าคลังแล้ว</StatusPill>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {node.points.map((row) => (
        <Row key={row.id}>
          <span className={cn('nums font-medium', row.delta < 0 ? 'text-danger' : 'text-ink')}>
            {row.delta > 0 ? '+' : ''}
            {row.delta.toLocaleString('th-TH')} แต้ม
          </span>
          <span className="text-muted">
            {row.reason}
            {row.note ? ` · ${row.note}` : ''} · ผู้ใช้ {row.userId}
            {row.reversesId ? ` · แก้ ${row.reversesId}` : ''}
          </span>
          <span className="text-muted text-[11px]">แถว {row.id}</span>
          <AdjustButton onClick={() => setAdjusting({ type: 'points', row })} />
        </Row>
      ))}

      {node.earnings.map((row) => {
        const status = EARNING_STATUS[row.status] ?? { label: row.status, tone: 'plain' as const };
        return (
          <div key={row.id} className="space-y-1.5">
            <Row>
              <span className="text-ink nums font-medium">{formatMoney(row.amountThb, 'THB')}</span>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
              <span className="text-muted">
                ส่วนแบ่ง {row.sharePercent}% · ผู้ใช้ {row.userId}
                {row.reversesId ? ` · แก้ ${row.reversesId}` : ''}
              </span>
              <span className="text-muted text-[11px]">รายได้ {row.id}</span>
              <AdjustButton onClick={() => setAdjusting({ type: 'earning', row })} />
            </Row>
            {row.events.length > 0 ? (
              <ol className="text-muted ml-3 space-y-0.5 text-[11px]">
                {row.events.map((event, i) => (
                  <li key={`${event.occurredAt}-${i}`} className="nums">
                    {formatWhen(event.occurredAt)} · {event.from || '—'} → {event.to}
                    {event.reason ? ` · ${event.reason}` : ''}
                    {event.ref ? ` · อ้างอิง ${event.ref}` : ''}
                    {event.actorId ? ` · โดย ${event.actorId}` : ''}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        );
      })}

      {node.codes.map((code) => (
        <Row key={code.id}>
          <span className="text-ink font-medium">{code.code}</span>
          <span className="text-muted nums">
            {formatMoney(code.amountThb, 'THB')} · ผู้ใช้ {code.userId}
          </span>
          {code.voidedAt ? (
            <StatusPill tone="danger">ยกเลิกแล้ว {formatWhen(code.voidedAt)}</StatusPill>
          ) : code.usedAt ? (
            <StatusPill tone="ok">ใช้แล้ว {formatWhen(code.usedAt)}</StatusPill>
          ) : (
            <StatusPill tone="plain">ยังไม่ใช้</StatusPill>
          )}
        </Row>
      ))}

      {node.flags.map((flag) => (
        <Row key={flag.id}>
          <Flag className="text-danger size-3.5" />
          <span className="text-ink">{flag.reason}</span>
          {flag.resolvedAt ? (
            <StatusPill tone="ok">ตัดสินแล้ว · {flag.resolution}</StatusPill>
          ) : (
            <StatusPill tone="danger">ต้องตรวจ</StatusPill>
          )}
        </Row>
      ))}

      {adjusting ? (
        <AdjustForm
          target={adjusting}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </Card>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg/60 rounded-brand-sm flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-xs">
      {children}
    </div>
  );
}

function AdjustButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted hover:text-ink ml-auto inline-flex items-center gap-1 text-[11px] font-medium"
    >
      <Pencil className="size-3" /> แก้ยอด
    </button>
  );
}

/** Snapshot as labelled facts; the raw JSON stays one click away. */
function SnapshotView({ snapshot }: { snapshot: Record<string, unknown> }) {
  const entries = Object.entries(snapshot);
  if (entries.length === 0) return null;

  return (
    <div>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex min-w-0 gap-2">
            <dt className="text-muted shrink-0">{SNAPSHOT_LABEL[key] ?? key}</dt>
            <dd className="text-ink nums min-w-0 break-words">{readable(value)}</dd>
          </div>
        ))}
      </dl>
      <details className="mt-1.5">
        <summary className="text-muted cursor-pointer text-[11px]">ดู snapshot ดิบ</summary>
        <pre className="bg-bg/60 rounded-brand-sm mt-1 overflow-x-auto p-2 text-[11px]">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function readable(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('th-TH');
  if (typeof value !== 'object') return String(value);
  const obj = value as Record<string, unknown>;
  const name = obj.name ?? obj.title;
  if (typeof name === 'string') {
    const handle = typeof obj.handle === 'string' ? ` (@${obj.handle})` : '';
    return `${name}${handle}${typeof obj.id === 'string' ? ` · ${obj.id}` : ''}`;
  }
  return JSON.stringify(value);
}

/* --------------------------------------------------------------- adjust -- */

function AdjustForm({
  target,
  onClose,
}: {
  target: { type: 'points'; row: TracePoints } | { type: 'earning'; row: TraceEarning };
  onClose: () => void;
}) {
  const adjust = useLedgerAdjust();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');

  const value = Number(amount);
  const valid =
    amount.trim() !== '' &&
    Number.isFinite(value) &&
    value !== 0 &&
    (target.type === 'earning' || Number.isInteger(value)) &&
    reason.trim().length > 0;

  async function submit() {
    try {
      await adjust.mutateAsync({
        targetType: target.type,
        targetId: target.row.id,
        amount: value,
        reason: reason.trim(),
        reference: reference.trim() || undefined,
      });
      onClose();
    } catch {
      // Shown below from `adjust.error`.
    }
  }

  return (
    <form
      className="border-border space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <p className="text-ink text-sm font-medium">
        แก้ยอด{target.type === 'points' ? 'แต้ม' : 'รายได้'} {target.row.id}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={target.type === 'points' ? 'จำนวนแต้ม (ติดลบ = หักออก)' : 'ยอดเงิน ฿ (ติดลบ = หักออก)'}
          hint={
            target.type === 'earning'
              ? `ใส่ −${target.row.amountThb} เพื่อกลับรายการทั้งก้อน ถ้ายังไม่เข้ารอบโอน`
              : 'จำนวนเต็มเท่านั้น'
          }
        >
          <Input
            type="number"
            step={target.type === 'points' ? 1 : 0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="nums"
          />
        </Field>
        <Field label="อ้างอิง (ไม่บังคับ)" hint="เช่น เลขใบแจ้งยอด หรือเลขเคส">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <Field label="เหตุผล (บังคับ)">
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {adjust.error ? <p className="text-danger text-xs">{adjust.error.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || adjust.isPending}>
          {adjust.isPending ? 'กำลังบันทึก…' : 'บันทึกการแก้ยอด'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- flags -- */

function FlagsPanel({ onTrace }: { onTrace: (flag: LedgerFlag) => void }) {
  const [showAll, setShowAll] = useState(false);
  const { data: flags = [], isLoading } = useLedgerFlags(!showAll);

  return (
    <section>
      <SectionHeader
        label={`รายการที่ต้องตรวจ${showAll ? '' : ` (${flags.length})`}`}
        action={
          <label className="text-muted flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            แสดงที่ตัดสินแล้วด้วย
          </label>
        }
      />
      {isLoading ? (
        <div className="rounded-brand bg-surface h-16 animate-pulse" />
      ) : flags.length === 0 ? (
        <div className="rounded-brand bg-surface text-muted p-6 text-center text-sm">
          ไม่มีรายการที่ต้องตรวจ
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((flag) => (
            <FlagCard key={flag.id} flag={flag} onTrace={() => onTrace(flag)} />
          ))}
        </div>
      )}
    </section>
  );
}

function FlagCard({ flag, onTrace }: { flag: LedgerFlag; onTrace: () => void }) {
  const resolve = useResolveFlag();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState('');

  async function submit() {
    try {
      await resolve.mutateAsync({ flagId: flag.id, resolution: resolution.trim() });
      setOpen(false);
    } catch {
      // Shown below from `resolve.error`.
    }
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Flag className="text-danger size-4" />
        <span className="text-ink text-sm font-medium">{flag.reason}</span>
        {flag.resolvedAt ? (
          <StatusPill tone="ok">ตัดสินแล้ว</StatusPill>
        ) : (
          <StatusPill tone="danger">ต้องตรวจ</StatusPill>
        )}
        <span className="text-muted nums text-xs">{formatWhen(flag.createdAt)}</span>
      </div>
      <p className="text-muted text-[11px] break-all">
        {flag.subjectType} {flag.subjectId}
        {flag.resolvedAt ? ` · ${formatWhen(flag.resolvedAt)} · ${flag.resolution}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="soft" onClick={onTrace}>
          <Search className="size-3.5" /> ไล่ที่มา
        </Button>
        {!flag.resolvedAt && !open ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            ตัดสิน
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (resolution.trim()) void submit();
          }}
        >
          <Field label="ตัดสินอย่างไร (บังคับ)" hint="ถ้าต้องหักหรือคืนเงิน ให้แก้ยอดจากผลการไล่ที่มา">
            <Textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
          {resolve.error ? <p className="text-danger text-xs">{resolve.error.message}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!resolution.trim() || resolve.isPending}>
              {resolve.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
