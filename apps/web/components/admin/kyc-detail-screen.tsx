'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

import { whenLabel } from '@/components/admin/admin-format';
import { sameName } from '@/components/admin/kyc-screen';
import { KeyValueList, StatusPill } from '@/components/admin/ui/status-pill';
import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useApproveKyc, useKycDetail, useRejectKyc, useRevokeKyc } from '@/features/admin/queries';
import type { KycDetail } from '@/lib/data';
import { bankName } from '@/lib/catalog/banks';
import { KYC_STEPS, KYC_STEP_LABEL } from '@/lib/kyc';

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'danger' | 'plain' | 'info' }> = {
  draft: { label: 'ยังไม่ส่ง', tone: 'plain' },
  submitted: { label: 'รอตรวจ', tone: 'wait' },
  approved: { label: 'ผ่านแล้ว', tone: 'ok' },
  rejected: { label: 'ไม่ผ่าน', tone: 'danger' },
  revoked: { label: 'ระงับ', tone: 'danger' },
};

const ACCOUNT_STATUS: Record<string, string> = {
  pending: 'รอตรวจ',
  verified: 'ตรวจแล้ว',
  rejected: 'ใช้ไม่ได้',
  replaced: 'เลิกใช้แล้ว',
};

/** One verification, laid out for comparing: card beside selfie, legal name beside account name. */
export function KycDetailScreen({ verificationId }: { verificationId: string }) {
  const { data, isLoading, error } = useKycDetail(verificationId);

  return (
    <div className="space-y-6">
      <Link
        href={'/admin/kyc' as never}
        className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-medium"
      >
        <ArrowLeft className="size-3.5" /> ยืนยันตัวตน
      </Link>
      {isLoading ? (
        <div className="rounded-brand bg-surface h-60 animate-pulse" />
      ) : !data ? (
        <p className="text-danger text-sm">{error?.message ?? 'โหลดไม่สำเร็จ'}</p>
      ) : (
        <Detail d={data} />
      )}
    </div>
  );
}

function Detail({ d }: { d: KycDetail }) {
  const status = STATUS[d.status] ?? { label: d.status, tone: 'plain' as const };
  const nameMatches = sameName(d.legalName, d.account?.accountName ?? '');

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-ink text-2xl font-medium tracking-tight">
          {d.name} {d.handle ? <span className="text-muted text-base">@{d.handle}</span> : null}
        </h1>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        {d.sharedAccounts > 0 ? (
          <StatusPill tone="danger">
            <AlertTriangle className="size-3" /> บัญชีซ้ำกับผู้ใช้อื่น {d.sharedAccounts} คน
          </StatusPill>
        ) : null}
      </div>

      <section>
        <SectionHeader label="รูปบัตรและเซลฟี่ (ลิงก์ใช้ได้ 10 นาที)" />
        <div className="grid gap-3 md:grid-cols-2">
          <Photo label="รูปบัตร" url={d.idCardUrl} />
          <Photo label="เซลฟี่คู่บัตร" url={d.selfieUrl} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="section-label mb-1">ตัวตน</p>
          <KeyValueList
            items={[
              { label: 'ประเภท', value: d.legalType === 'juristic' ? 'นิติบุคคล' : 'บุคคลธรรมดา' },
              { label: 'ชื่อจริง', value: d.legalName || '—' },
              {
                label: d.legalType === 'juristic' ? 'เลขผู้เสียภาษี' : 'เลขบัตรประชาชน',
                value: d.idNumber || '—',
              },
              { label: 'เบอร์โทร', value: `${d.phone || '—'}${d.phoneVerified ? ' ✓' : ' (ยังไม่ยืนยัน)'}` },
              { label: 'อีเมล', value: `${d.email || '—'}${d.emailVerified ? ' ✓' : ' (ยังไม่ยืนยัน)'}` },
              { label: 'ส่งตรวจ', value: d.submittedAt ? whenLabel(d.submittedAt) : '—' },
            ]}
          />
        </Card>
        <Card className="p-4">
          <p className="section-label mb-1">บัญชีรับเงิน</p>
          {d.account ? (
            <>
              <KeyValueList
                items={[
                  {
                    label: 'ธนาคาร',
                    value: d.account.kind === 'promptpay' ? 'พร้อมเพย์' : bankName(d.account.bankCode),
                  },
                  { label: 'เลขบัญชี', value: d.account.number },
                  {
                    label: 'ชื่อบัญชี',
                    value: (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {d.account.accountName}
                        {nameMatches ? (
                          <StatusPill tone="ok">ตรงกับชื่อจริง</StatusPill>
                        ) : (
                          <StatusPill tone="danger">ไม่ตรงกับชื่อจริง</StatusPill>
                        )}
                      </span>
                    ),
                  },
                  { label: 'สถานะบัญชี', value: ACCOUNT_STATUS[d.account.status] ?? d.account.status },
                ]}
              />
              {d.account.sharedWith.length > 0 ? (
                <p className="text-danger mt-2 text-xs">
                  ใช้บัญชีเดียวกับ:{' '}
                  {d.account.sharedWith.map((u) => u.name || u.handle || u.id).join(', ')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted text-sm">ยังไม่มีบัญชี</p>
          )}
        </Card>
      </div>

      {d.rejectReason ? (
        <p className="text-muted text-sm">
          ผลตรวจครั้งก่อน: {d.rejectedSteps.map((s) => KYC_STEP_LABEL[s]).join(', ')} — {d.rejectReason}
        </p>
      ) : null}

      <Actions d={d} />

      {d.history.length > 0 ? (
        <section>
          <SectionHeader label="ประวัติ" />
          <Card className="divide-border divide-y">
            {d.history.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
                <span className="text-muted nums">{whenLabel(row.occurredAt)}</span>
                <span className="text-ink">{row.action}</span>
                <span className="text-muted">{row.actorName || row.actorId}</span>
                {row.reason ? <span className="text-ink">· {row.reason}</span> : null}
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </>
  );
}

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <Card className="p-3">
      <p className="text-muted mb-2 text-xs">{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, never optimised */}
          <img src={url} alt={label} className="rounded-brand-sm bg-bg max-h-80 w-full object-contain" />
        </a>
      ) : (
        <div className="rounded-brand-sm bg-bg text-muted flex h-40 items-center justify-center text-sm">
          ยังไม่ได้อัปโหลด
        </div>
      )}
    </Card>
  );
}

function Actions({ d }: { d: KycDetail }) {
  const approve = useApproveKyc();
  const reject = useRejectKyc();
  const revoke = useRevokeKyc();
  const [mode, setMode] = useState<'none' | 'approve' | 'reject' | 'revoke'>('none');
  const [steps, setSteps] = useState<string[]>([]);
  const [reason, setReason] = useState('');

  const errors = [approve.error, reject.error, revoke.error].filter(Boolean);
  const done = () => {
    setMode('none');
    setReason('');
    setSteps([]);
  };

  if (d.status !== 'submitted' && d.status !== 'approved') return null;

  return (
    <section>
      <SectionHeader label="ตัดสิน" />
      <Card className="space-y-3 p-4">
        {mode === 'none' ? (
          <div className="flex flex-wrap gap-2">
            {d.status === 'submitted' ? (
              <>
                <Button size="sm" onClick={() => setMode('approve')}>
                  อนุมัติ
                </Button>
                <Button size="sm" variant="soft" onClick={() => setMode('reject')}>
                  ไม่ผ่าน
                </Button>
              </>
            ) : (
              <Button size="sm" variant="soft" onClick={() => setMode('revoke')}>
                ระงับการยืนยันตัวตน
              </Button>
            )}
          </div>
        ) : null}

        {mode === 'approve' ? (
          <>
            <p className="text-ink text-sm">
              อนุมัติแล้ว {d.name} จะได้ป้ายยืนยันตัวตนแล้ว และบัญชี
              {d.account ? ` ${bankName(d.account.bankCode)} ${d.account.number}` : ''} จะใช้รับโอนรอบถัดไป
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(d.id, { onSuccess: done })}>
                ยืนยันอนุมัติ
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('none')}>
                ยกเลิก
              </Button>
            </div>
          </>
        ) : null}

        {mode === 'reject' ? (
          <>
            <div role="group" aria-label="ขั้นที่ต้องแก้" className="flex flex-wrap gap-3">
              {KYC_STEPS.map((step) => (
                <label key={step} className="text-ink flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={steps.includes(step)}
                    onChange={(e) =>
                      setSteps((current) =>
                        e.target.checked ? [...current, step] : current.filter((s) => s !== step),
                      )
                    }
                  />
                  {KYC_STEP_LABEL[step]}
                </label>
              ))}
            </div>
            <Field label="เหตุผล (ผู้ใช้จะเห็นข้อความนี้)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={steps.length === 0 || !reason.trim() || reject.isPending}
                onClick={() => reject.mutate({ id: d.id, steps, reason: reason.trim() }, { onSuccess: done })}
              >
                ส่งกลับให้แก้
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('none')}>
                ยกเลิก
              </Button>
            </div>
          </>
        ) : null}

        {mode === 'revoke' ? (
          <>
            <p className="text-muted text-xs">ป้ายยืนยันตัวตนจะหายไป และรายได้จะไม่เข้ารอบโอนจนกว่าจะยืนยันใหม่</p>
            <Field label="เหตุผล (บังคับ)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!reason.trim() || revoke.isPending}
                onClick={() => revoke.mutate({ id: d.id, reason: reason.trim() }, { onSuccess: done })}
              >
                ยืนยันระงับ
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('none')}>
                ยกเลิก
              </Button>
            </div>
          </>
        ) : null}

        {errors.map((error, i) => (
          <p key={i} className="text-danger text-xs">
            {error?.message}
          </p>
        ))}
      </Card>
    </section>
  );
}
