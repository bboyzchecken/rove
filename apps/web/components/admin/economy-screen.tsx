'use client';

import { useState } from 'react';

import { DataTable, type Column } from '@/components/admin/ui/data-table';
import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import {
  useAdminAudit,
  useEconomySettings,
  useSetEconomySettings,
} from '@/features/admin/queries';
import type { AdminAuditEntry, EconomySettings } from '@/lib/data';

/**
 * ตั้งค่าส่วนแบ่ง (Feedback #4 — D-30): the creator share s% and the booker
 * credit α%. Every save is written to the audit log with its reason.
 */
export function EconomyScreen() {
  const { data: settings, isLoading } = useEconomySettings();
  const { data: audit = [] } = useAdminAudit('app_settings');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-ink text-2xl font-medium tracking-tight">
          ตั้งค่าส่วนแบ่ง
        </h1>
        <p className="text-muted mt-1 text-sm">
          มีผลกับการจองที่พาร์ตเนอร์ยืนยันหลังบันทึก รายการที่เกิดไปแล้วไม่เปลี่ยน
        </p>
      </div>

      {isLoading || !settings ? (
        <div className="rounded-brand bg-surface h-40 animate-pulse" />
      ) : (
        // Keyed so a save that comes back re-seeds the form from the server.
        <EconomyForm
          key={`${settings.creatorSharePercent}-${settings.bookerCreditPercent}`}
          settings={settings}
        />
      )}

      <section>
        <SectionHeader label="ประวัติการเปลี่ยน" />
        <DataTable
          rows={audit}
          columns={AUDIT_COLUMNS}
          rowKey={(row) => row.id}
          caption="ประวัติการเปลี่ยนค่าส่วนแบ่ง"
          empty="ยังไม่เคยเปลี่ยน"
        />
      </section>
    </div>
  );
}

function EconomyForm({ settings }: { settings: EconomySettings }) {
  const save = useSetEconomySettings();
  const [creator, setCreator] = useState(String(settings.creatorSharePercent));
  const [booker, setBooker] = useState(String(settings.bookerCreditPercent));
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);

  const creatorValue = Number(creator);
  const bookerValue = Number(booker);
  const inRange = (value: number, max: number) =>
    Number.isInteger(value) && value >= 0 && value <= max;
  const valid =
    creator.trim() !== '' &&
    booker.trim() !== '' &&
    inRange(creatorValue, settings.maxCreatorSharePercent) &&
    inRange(bookerValue, settings.maxBookerCreditPercent);
  const changed =
    creatorValue !== settings.creatorSharePercent || bookerValue !== settings.bookerCreditPercent;

  async function submit() {
    setSaved(false);
    try {
      await save.mutateAsync({
        creatorSharePercent: creatorValue,
        bookerCreditPercent: bookerValue,
        reason: reason.trim() || undefined,
      });
      setSaved(true);
    } catch {
      // Shown below from `save.error`.
    }
  }

  return (
    <Card className="max-w-xl p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && changed) void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="ส่วนแบ่งครีเอเตอร์ (%)"
            hint={`ค่าเริ่มต้น ${settings.defaultCreatorSharePercent}% · สูงสุด ${settings.maxCreatorSharePercent}%`}
          >
            <Input
              type="number"
              min={0}
              max={settings.maxCreatorSharePercent}
              step={1}
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              className="nums"
            />
          </Field>
          <Field
            label="เครดิตคืนผู้จอง (%)"
            hint={`ค่าเริ่มต้น ${settings.defaultBookerCreditPercent}% · สูงสุด ${settings.maxBookerCreditPercent}%`}
          >
            <Input
              type="number"
              min={0}
              max={settings.maxBookerCreditPercent}
              step={1}
              value={booker}
              onChange={(e) => setBooker(e.target.value)}
              className="nums"
            />
          </Field>
        </div>
        <Field label="เหตุผล" hint="บันทึกไว้ในประวัติการเปลี่ยน">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {!valid ? (
          <p className="text-danger text-xs">ใส่เป็นจำนวนเต็มในช่วงที่กำหนด</p>
        ) : null}
        {save.error ? <p className="text-danger text-xs">{save.error.message}</p> : null}
        {saved && !changed ? <p className="text-muted text-xs">บันทึกแล้ว</p> : null}
        <Button type="submit" size="sm" disabled={!valid || !changed || save.isPending}>
          {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      </form>
    </Card>
  );
}

const ECONOMY_KEY_LABEL: Record<string, string> = {
  creator_share_percent: 'ส่วนแบ่งครีเอเตอร์',
  booker_credit_percent: 'เครดิตคืนผู้จอง',
};

function describeChange(before: unknown, after: unknown): string {
  if (!after || typeof after !== 'object') return '—';
  const prev = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const lines = Object.entries(after as Record<string, unknown>)
    .filter(([key, value]) => prev[key] !== value)
    .map(([key, value]) => `${ECONOMY_KEY_LABEL[key] ?? key} ${String(prev[key] ?? '—')}% → ${String(value)}%`);
  return lines.length > 0 ? lines.join(' · ') : 'ไม่เปลี่ยน';
}

const AUDIT_COLUMNS: Column<AdminAuditEntry>[] = [
  {
    key: 'when',
    header: 'เวลา',
    cell: (row) => (
      <span className="nums text-muted text-xs">
        {new Date(row.occurredAt).toLocaleString('th-TH', {
          day: 'numeric',
          month: 'short',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    ),
    sortBy: (row) => row.occurredAt,
  },
  {
    key: 'actor',
    header: 'ผู้แก้',
    cell: (row) => row.actorName || row.actorId,
    sortBy: (row) => row.actorName,
  },
  {
    key: 'change',
    header: 'การเปลี่ยนแปลง',
    cell: (row) => <span className="nums">{describeChange(row.before, row.after)}</span>,
  },
  {
    key: 'reason',
    header: 'เหตุผล',
    cell: (row) => <span className="text-muted">{row.reason || '—'}</span>,
  },
];
