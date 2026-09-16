'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

import { whenLabel } from '@/components/admin/admin-format';
import { DataTable, type Column } from '@/components/admin/ui/data-table';
import { StatusPill } from '@/components/admin/ui/status-pill';
import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import {
  useKycQueue,
  usePendingAccounts,
  useRejectAccount,
  useVerifyAccount,
} from '@/features/admin/queries';
import type { KycQueueRow, PendingAccountChange, VerificationStatus } from '@/lib/data';
import { accountLabel } from '@/lib/catalog/banks';
import { cn } from '@/lib/utils';

/**
 * ยืนยันตัวตน (Feedback #4 — D-23, D-39). The queue an admin works through by
 * hand until an e-KYC provider takes over, plus payout-account changes from
 * creators who are already verified.
 */

const TABS: { status: VerificationStatus; label: string }[] = [
  { status: 'submitted', label: 'รอตรวจ' },
  { status: 'rejected', label: 'ไม่ผ่าน' },
  { status: 'approved', label: 'ผ่านแล้ว' },
  { status: 'revoked', label: 'ระงับ' },
];

export function sameName(a: string, b: string) {
  const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  return Boolean(a && b) && norm(a) === norm(b);
}

const COLUMNS: Column<KycQueueRow>[] = [
  {
    key: 'name',
    header: 'ผู้ใช้',
    cell: (r) => (
      <span>
        {r.name} {r.handle ? <span className="text-muted text-xs">@{r.handle}</span> : null}
      </span>
    ),
    sortBy: (r) => r.name,
  },
  {
    key: 'legal',
    header: 'ชื่อจริง / ชื่อบัญชี',
    cell: (r) => (
      <span className="flex flex-col">
        <span>{r.legalName || '—'}</span>
        <span className={cn('text-xs', sameName(r.legalName, r.accountName) ? 'text-muted' : 'text-danger')}>
          {r.accountName || 'ยังไม่มีบัญชี'}
          {r.accountName && !sameName(r.legalName, r.accountName) ? ' · ไม่ตรง' : ''}
        </span>
      </span>
    ),
  },
  {
    key: 'type',
    header: 'ประเภท',
    cell: (r) => (r.legalType === 'juristic' ? 'นิติบุคคล' : 'บุคคลธรรมดา'),
  },
  {
    key: 'flags',
    header: 'ข้อควรระวัง',
    cell: (r) =>
      r.sharedAccounts > 0 ? (
        <StatusPill tone="danger">
          <AlertTriangle className="size-3" /> บัญชีซ้ำกับผู้ใช้อื่น {r.sharedAccounts} คน
        </StatusPill>
      ) : (
        <span className="text-muted text-xs">—</span>
      ),
    sortBy: (r) => r.sharedAccounts,
  },
  {
    key: 'submitted',
    header: 'ส่งตรวจ',
    cell: (r) => <span className="text-muted text-xs">{r.submittedAt ? whenLabel(r.submittedAt) : '—'}</span>,
    sortBy: (r) => r.submittedAt ?? '',
  },
];

export function KycScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus>('submitted');
  const { data: rows = [], isLoading } = useKycQueue(status);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-ink text-2xl font-medium tracking-tight">ยืนยันตัวตน</h1>
        <p className="text-muted mt-1 text-sm">
          เทียบรูปบัตรกับเซลฟี่ และชื่อจริงกับชื่อบัญชีรับเงิน ก่อนอนุมัติ
        </p>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.status}
              type="button"
              onClick={() => setStatus(tab.status)}
              className={cn(
                'rounded-brand-sm px-3 py-1.5 text-xs font-medium transition',
                status === tab.status ? 'bg-primary text-primary-fg' : 'bg-surface text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="rounded-brand bg-surface h-24 animate-pulse" />
        ) : (
          <DataTable
            rows={rows}
            columns={COLUMNS}
            rowKey={(r) => r.id}
            caption="คำขอยืนยันตัวตน"
            empty="ไม่มีคำขอในสถานะนี้"
            onRowClick={(r) => router.push(`/admin/kyc/${r.id}` as never)}
          />
        )}
      </section>

      <AccountChanges />
    </div>
  );
}

function AccountChanges() {
  const { data: accounts = [] } = usePendingAccounts();

  return (
    <section>
      <SectionHeader label={`เปลี่ยนบัญชีรับเงิน (${accounts.length})`} />
      {accounts.length === 0 ? (
        <div className="rounded-brand bg-surface text-muted p-6 text-center text-sm">
          ไม่มีบัญชีใหม่รอตรวจ
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountCard({ account }: { account: PendingAccountChange }) {
  const verify = useVerifyAccount();
  const reject = useRejectAccount();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const matches = sameName(account.legalName, account.accountName);

  return (
    <Card className="space-y-2.5 p-4">
      <p className="text-ink font-medium">{account.name}</p>
      <div className="text-sm">
        <p className="text-ink nums">
          {accountLabel(account.kind, account.bankCode, '')} · {account.number}
        </p>
        <p className="text-muted text-xs">
          ชื่อบัญชี {account.accountName} · ชื่อจริง {account.legalName || '—'}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {matches ? <StatusPill tone="ok">ชื่อตรงกัน</StatusPill> : <StatusPill tone="danger">ชื่อไม่ตรง</StatusPill>}
        {account.sharedWith.length > 0 ? (
          <StatusPill tone="danger">
            <AlertTriangle className="size-3" /> บัญชีซ้ำกับผู้ใช้อื่น {account.sharedWith.length} คน
          </StatusPill>
        ) : null}
        <span className="text-muted text-xs">ขอเมื่อ {whenLabel(account.createdAt)}</span>
      </div>

      {verify.error ? <p className="text-danger text-xs">{verify.error.message}</p> : null}
      {reject.error ? <p className="text-danger text-xs">{reject.error.message}</p> : null}

      {rejecting ? (
        <div className="flex gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลที่ใช้ไม่ได้ (บังคับ)"
          />
          <Button
            size="sm"
            className="h-auto shrink-0"
            disabled={!reason.trim() || reject.isPending}
            onClick={() => reject.mutate({ id: account.id, reason: reason.trim() })}
          >
            ยืนยัน
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={verify.isPending} onClick={() => verify.mutate(account.id)}>
            บัญชีใช้ได้
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
            ใช้ไม่ได้
          </Button>
        </div>
      )}
    </Card>
  );
}
