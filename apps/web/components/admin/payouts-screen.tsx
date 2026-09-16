'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, ChevronRight } from 'lucide-react';

import { dayLabel, whenLabel } from '@/components/admin/admin-format';
import { DataTable, type Column } from '@/components/admin/ui/data-table';
import { StatusPill } from '@/components/admin/ui/status-pill';
import { SectionHeader, Stat } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import {
  useCloseCycle,
  useMoveCycle,
  usePayoutEarnings,
  usePayoutsOverview,
  useReconcile,
  useSetPayoutAnchor,
} from '@/features/admin/queries';
import type { AdminEarning, PayoutCycle, PayoutsOverview, ReadyCreator } from '@/lib/data';
import { addDays, toIsoDate } from '@/lib/data/domain';
import { formatMoney } from '@/lib/format';
import { isTuesday } from '@/lib/kyc';

/**
 * จ่ายครีเอเตอร์ (Feedback #4 — F11, D-21, D-35, D-40).
 *
 * In the order the work happens: mark what partners actually paid, see who
 * that makes payable and why some of them will not be paid yet, close the
 * fortnight, then record each transfer on the cycle's own page.
 */
export function PayoutsScreen() {
  const { data, isLoading, error } = usePayoutsOverview();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-ink text-2xl font-medium tracking-tight">จ่ายครีเอเตอร์</h1>
        <p className="text-muted mt-1 text-sm">
          ปิดยอดวันอังคารเว้นอังคาร · โอนภายใน 3 วันทำการ · นับเฉพาะยอดที่พาร์ตเนอร์จ่ายเราแล้ว
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-brand bg-surface h-32 animate-pulse" />
      ) : !data ? (
        <p className="text-danger text-sm">{error?.message ?? 'โหลดไม่สำเร็จ'}</p>
      ) : (
        <>
          <Counters data={data} />
          {data.anchorDate ? (
            data.nextCycle ? (
              <NextCycleCard cycle={data.nextCycle} ready={data.ready} />
            ) : null
          ) : (
            <AnchorForm />
          )}
          <ReconcileSection />
          <ReadySection data={data} />
          <CyclesSection cycles={data.cycles} />
        </>
      )}
    </div>
  );
}

function Counters({ data }: { data: PayoutsOverview }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Card className="p-4">
        <Stat value={formatMoney(data.pendingThb, 'THB')} label={`รอกระทบยอด ${data.pendingCount} รายการ`} />
      </Card>
      <Card className="p-4">
        <Stat value={formatMoney(data.heldThb, 'THB')} label="รอครีเอเตอร์ยืนยันตัวตน" />
      </Card>
      <Link href={'/admin/kyc' as never}>
        <Card className="hover:bg-bg/60 h-full p-4 transition">
          <Stat value={data.kycQueue} label="คิวยืนยันตัวตน" />
        </Card>
      </Link>
      <Link href={'/admin/kyc' as never}>
        <Card className="hover:bg-bg/60 h-full p-4 transition">
          <Stat value={data.accountQueue} label="บัญชีใหม่รอตรวจ" />
        </Card>
      </Link>
      <Link href={'/admin/trace' as never}>
        <Card className="hover:bg-bg/60 h-full p-4 transition">
          <Stat value={data.openFlags} label="ธงที่ต้องตรวจ" />
        </Card>
      </Link>
    </div>
  );
}

/* ----------------------------------------------------------------- anchor -- */

function nextTuesday() {
  let day = toIsoDate(new Date());
  while (!isTuesday(day)) day = addDays(day, 1);
  return day;
}

function AnchorForm() {
  const save = useSetPayoutAnchor();
  const [date, setDate] = useState(nextTuesday);
  const [reason, setReason] = useState('');
  const today = toIsoDate(new Date());
  const valid = Boolean(date) && isTuesday(date) && date >= today;

  return (
    <section>
      <SectionHeader label="ตั้งวันปิดยอดรอบแรก" />
      <Card className="max-w-xl space-y-3 p-5">
        <p className="text-ink text-sm">
          ยังไม่มีรอบปิดยอด — เลือกวันอังคารที่จะปิดยอดรอบแรก แล้วระบบจะนับรอบถัดไปทุก 14 วันจากวันนั้น
          ตั้งแล้วเปลี่ยนไม่ได้ (เลื่อนแต่ละรอบให้เร็วขึ้นได้)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="วันอังคารตั้งต้น" hint={date && isTuesday(date) ? dayLabel(date) : 'ต้องเป็นวันอังคาร'}>
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="หมายเหตุ (ไม่บังคับ)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        {date && !isTuesday(date) ? <p className="text-danger text-xs">วันที่เลือกไม่ใช่วันอังคาร</p> : null}
        {save.error ? <p className="text-danger text-xs">{save.error.message}</p> : null}
        <Button
          size="sm"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate({ anchorDate: date, reason: reason.trim() || undefined })}
        >
          {save.isPending ? 'กำลังบันทึก…' : 'เริ่มรอบปิดยอด'}
        </Button>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------- next cycle -- */

function NextCycleCard({ cycle, ready }: { cycle: PayoutCycle; ready: ReadyCreator[] }) {
  const router = useRouter();
  const move = useMoveCycle();
  const close = useCloseCycle();
  const [moving, setMoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cutoff, setCutoff] = useState('');
  const [reason, setReason] = useState('');
  const today = toIsoDate(new Date());

  const paid = ready.filter((r) => r.willBePaid);
  const rolled = ready.filter((r) => !r.willBePaid);
  const total = paid.reduce((n, r) => n + r.amountThb, 0);

  async function closeNow() {
    try {
      const detail = await close.mutateAsync(cycle.id);
      router.push(`/admin/payouts/${detail.cycle.id}` as never);
    } catch {
      // Shown from `close.error`.
    }
  }

  return (
    <section>
      <SectionHeader label="รอบถัดไป" />
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-ink flex items-center gap-2 text-lg font-medium">
              <CalendarClock className="size-5" /> ปิดยอด {dayLabel(cycle.cutoffDate)}
            </p>
            <p className="text-muted mt-1 text-sm">โอนภายใน {dayLabel(cycle.dueDate)}</p>
            {cycle.cutoffDate !== cycle.originalCutoff ? (
              <p className="text-muted mt-1 text-xs">
                เลื่อนมาจาก {dayLabel(cycle.originalCutoff)} · {cycle.movedReason}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" onClick={() => setMoving((v) => !v)}>
              เลื่อนให้เร็วขึ้น
            </Button>
            <Button size="sm" onClick={() => setConfirming(true)} disabled={confirming}>
              ปิดรอบนี้
            </Button>
          </div>
        </div>

        {moving ? (
          <form
            className="border-border space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              move.mutate(
                { cycleId: cycle.id, cutoffDate: cutoff, reason: reason.trim() },
                {
                  onSuccess: () => {
                    setMoving(false);
                    setReason('');
                  },
                },
              );
            }}
          >
            <p className="text-muted text-xs">เลื่อนได้เฉพาะให้เร็วขึ้น เช่น ช่วงวันหยุดยาว — เลื่อนช้าลงไม่ได้</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="วันปิดยอดใหม่">
                <Input
                  type="date"
                  min={today}
                  max={addDays(cycle.cutoffDate, -1)}
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                />
              </Field>
              <Field label="เหตุผล (บังคับ)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
            {move.error ? <p className="text-danger text-xs">{move.error.message}</p> : null}
            <Button
              type="submit"
              size="sm"
              disabled={!cutoff || cutoff >= cycle.cutoffDate || !reason.trim() || move.isPending}
            >
              บันทึกวันใหม่
            </Button>
          </form>
        ) : null}

        {confirming ? (
          <div className="border-border space-y-3 border-t pt-4">
            <p className="text-ink text-sm font-medium">
              ปิดรอบแล้วจะสร้างรายการโอน {paid.length} รายการ รวม {formatMoney(total, 'THB')}
            </p>
            {paid.length > 0 ? (
              <ul className="text-ink space-y-1 text-sm">
                {paid.map((r) => (
                  <li key={r.userId} className="flex justify-between gap-3">
                    <span>
                      {r.name} {r.handle ? <span className="text-muted">@{r.handle}</span> : null}
                    </span>
                    <span className="nums">{formatMoney(r.amountThb, 'THB')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">ยังไม่มีใครเข้าเงื่อนไขรับโอนในรอบนี้</p>
            )}
            {rolled.length > 0 ? (
              <p className="text-muted text-xs">
                ทบไปรอบหน้า: {rolled.map((r) => `${r.name} (${notPaidReason(r)})`).join(', ')}
              </p>
            ) : null}
            {close.error ? <p className="text-danger text-xs">{close.error.message}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" disabled={close.isPending} onClick={() => void closeNow()}>
                {close.isPending ? 'กำลังปิดรอบ…' : 'ยืนยันปิดรอบ'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                ยกเลิก
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function notPaidReason(r: ReadyCreator) {
  if (!r.verified) return 'ยังไม่ยืนยันตัวตน';
  if (!r.accountVerified) return 'บัญชียังไม่ผ่านตรวจ';
  if (r.belowMinimum) return 'ต่ำกว่าขั้นต่ำ';
  return '';
}

/* -------------------------------------------------------------- reconcile -- */

function ReconcileSection() {
  const { data: earnings = [] } = usePayoutEarnings('pending');
  const reconcile = useReconcile();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ref, setRef] = useState('');
  const [moved, setMoved] = useState<number | null>(null);

  const selectedTotal = useMemo(
    () => earnings.filter((e) => picked.has(e.id)).reduce((n, e) => n + e.amountThb, 0),
    [earnings, picked],
  );

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: Column<AdminEarning>[] = [
    {
      key: 'pick',
      header: '',
      cell: (e) => (
        <input
          type="checkbox"
          aria-label={`เลือก ${e.partner} ${e.name}`}
          checked={picked.has(e.id)}
          onChange={() => toggle(e.id)}
        />
      ),
    },
    { key: 'partner', header: 'พาร์ตเนอร์', cell: (e) => e.partner, sortBy: (e) => e.partner },
    { key: 'creator', header: 'ครีเอเตอร์', cell: (e) => e.name, sortBy: (e) => e.name },
    {
      key: 'when',
      header: 'ยืนยันการจอง',
      cell: (e) => <span className="text-muted text-xs">{whenLabel(e.occurredAt)}</span>,
      sortBy: (e) => e.occurredAt,
    },
    {
      key: 'commission',
      header: 'ค่าคอม',
      align: 'right',
      cell: (e) => `${formatMoney(e.commissionThb, 'THB')}${e.estimated ? ' *' : ''}`,
      sortBy: (e) => e.commissionThb,
    },
    {
      key: 'amount',
      header: 'ส่วนแบ่งครีเอเตอร์',
      align: 'right',
      cell: (e) => formatMoney(e.amountThb, 'THB'),
      sortBy: (e) => e.amountThb,
    },
  ];

  return (
    <section>
      <SectionHeader label="กระทบยอดกับใบแจ้งยอดพาร์ตเนอร์" />
      <DataTable
        rows={earnings}
        columns={columns}
        rowKey={(e) => e.id}
        caption="รายได้ที่รอพาร์ตเนอร์จ่าย"
        empty="ไม่มีรายการรอกระทบยอด"
      />
      {earnings.length > 0 ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            reconcile.mutate(
              { earningIds: [...picked], statementRef: ref.trim() },
              {
                onSuccess: (result) => {
                  setMoved(result.moved);
                  setPicked(new Set());
                  setRef('');
                },
              },
            );
          }}
        >
          <Field label="เลขใบแจ้งยอดของพาร์ตเนอร์" className="sm:w-72">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" disabled={picked.size === 0 || !ref.trim() || reconcile.isPending}>
            พาร์ตเนอร์จ่ายแล้ว {picked.size > 0 ? `(${picked.size} รายการ · ${formatMoney(selectedTotal, 'THB')})` : ''}
          </Button>
        </form>
      ) : null}
      {reconcile.error ? <p className="text-danger mt-2 text-xs">{reconcile.error.message}</p> : null}
      {moved !== null ? <p className="text-muted mt-2 text-xs">ย้ายไปรอโอนแล้ว {moved} รายการ</p> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ ready -- */

const READY_COLUMNS: Column<ReadyCreator>[] = [
  {
    key: 'name',
    header: 'ครีเอเตอร์',
    cell: (r) => (
      <span>
        {r.name} {r.handle ? <span className="text-muted text-xs">@{r.handle}</span> : null}
      </span>
    ),
    sortBy: (r) => r.name,
  },
  {
    key: 'amount',
    header: 'ยอดรอโอน',
    align: 'right',
    cell: (r) => `${formatMoney(r.amountThb, 'THB')} · ${r.earningCount} รายการ`,
    sortBy: (r) => r.amountThb,
  },
  {
    key: 'status',
    header: 'รอบนี้',
    cell: (r) =>
      r.willBePaid ? (
        <StatusPill tone="ok">จะได้รับโอน</StatusPill>
      ) : (
        <span className="flex flex-wrap gap-1">
          {!r.verified ? <StatusPill tone="wait">ยังไม่ยืนยันตัวตน</StatusPill> : null}
          {r.verified && !r.accountVerified ? <StatusPill tone="wait">บัญชียังไม่ผ่านตรวจ</StatusPill> : null}
          {r.belowMinimum ? <StatusPill tone="plain">ต่ำกว่าขั้นต่ำ · ทบรอบหน้า</StatusPill> : null}
        </span>
      ),
    sortBy: (r) => (r.willBePaid ? 0 : 1),
  },
];

function ReadySection({ data }: { data: PayoutsOverview }) {
  return (
    <section>
      <SectionHeader label={`ยอดรอโอน · ขั้นต่ำ ${formatMoney(data.minimumPayoutThb, 'THB')}`} />
      <DataTable
        rows={data.ready}
        columns={READY_COLUMNS}
        rowKey={(r) => r.userId}
        caption="ครีเอเตอร์ที่มียอดรอโอน"
        empty="ยังไม่มียอดรอโอน — กระทบยอดกับใบแจ้งยอดพาร์ตเนอร์ก่อน"
      />
    </section>
  );
}

/* ----------------------------------------------------------------- cycles -- */

function CyclesSection({ cycles }: { cycles: PayoutCycle[] }) {
  const router = useRouter();
  const columns: Column<PayoutCycle>[] = [
    { key: 'cutoff', header: 'ปิดยอด', cell: (c) => dayLabel(c.cutoffDate), sortBy: (c) => c.cutoffDate },
    { key: 'due', header: 'โอนภายใน', cell: (c) => dayLabel(c.dueDate), sortBy: (c) => c.dueDate },
    {
      key: 'status',
      header: 'สถานะ',
      cell: (c) =>
        c.overdue ? (
          <StatusPill tone="danger">เลยกำหนดโอน</StatusPill>
        ) : c.status === 'open' ? (
          <StatusPill tone="info">เปิดอยู่</StatusPill>
        ) : c.paidCount === c.payoutCount ? (
          <StatusPill tone="ok">โอนครบแล้ว</StatusPill>
        ) : (
          <StatusPill tone="wait">รอโอน</StatusPill>
        ),
    },
    {
      key: 'count',
      header: 'โอนแล้ว',
      align: 'right',
      cell: (c) => `${c.paidCount}/${c.payoutCount}`,
    },
    {
      key: 'total',
      header: 'ยอดรวม',
      align: 'right',
      cell: (c) => formatMoney(c.totalThb, 'THB'),
      sortBy: (c) => c.totalThb,
    },
    {
      key: 'open',
      header: '',
      cell: (c) => (c.status === 'closed' ? <ChevronRight className="text-muted size-4" /> : null),
    },
  ];

  return (
    <section>
      <SectionHeader label="รอบปิดยอด" />
      <DataTable
        rows={cycles}
        columns={columns}
        rowKey={(c) => c.id}
        caption="รอบปิดยอดทั้งหมด"
        empty="ยังไม่มีรอบ"
        onRowClick={(c) => {
          if (c.status === 'closed') router.push(`/admin/payouts/${c.id}` as never);
        }}
      />
    </section>
  );
}
