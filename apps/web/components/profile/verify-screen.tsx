'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Lock,
} from 'lucide-react';

import { IdCardExample } from '@/components/profile/id-card-example';
import { VerifiedBadge } from '@/components/profile/verified-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import {
  useSaveVerificationAccount,
  useSaveVerificationBasic,
  useSaveVerificationIdentity,
  useSendOtp,
  useSubmitVerification,
  useUploadVerificationDocuments,
  useVerification,
  useVerifyOtp,
} from '@/features/verification/queries';
import type { KycStepKey, OtpSent, Verification } from '@/lib/data';
import { THAI_BANKS, accountLabel } from '@/lib/catalog/banks';
import { formatThaiDate } from '@/lib/format';
import { KYC_STEPS, KYC_STEP_LABEL, OTP_RESEND_SECONDS, digits, validThaiId } from '@/lib/kyc';
import { cn } from '@/lib/utils';

/**
 * เปิดรับรายได้ (Feedback #4 — F11, D-22, D-38, D-39).
 *
 * Four steps, each saved on its own so nobody loses a half-typed form to a
 * closed tab. What the API says is editable is editable; everything else is a
 * read-only summary with a check or a lock, and a rejection points at exactly
 * the steps to redo.
 */
export function VerifyScreen() {
  const { data: v, isLoading, error } = useVerification();
  const submit = useSubmitVerification();
  const [open, setOpen] = useState<KycStepKey | null>(null);

  // Open the first step there is work to do on, once.
  useEffect(() => {
    if (!v || open !== null) return;
    const first =
      v.editableSteps.find((step) => v.rejectedSteps.includes(step)) ??
      KYC_STEPS.find((step) => v.editableSteps.includes(step) && !v.steps[step]) ??
      (v.status === 'approved' ? 'account' : null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default from loaded data
    if (first) setOpen(first);
  }, [v, open]);

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-5">
        <div className="bg-surface h-8 w-48 animate-pulse rounded-full" />
        <div className="rounded-brand bg-surface h-40 animate-pulse" />
      </div>
    );
  }
  if (!v) {
    return (
      <div className="px-4 py-5">
        <p className="text-danger text-sm">{error?.message ?? 'โหลดข้อมูลไม่สำเร็จ'}</p>
      </div>
    );
  }

  const allDone = KYC_STEPS.every((step) => v.steps[step]);
  const canSubmit = v.status === 'draft' || v.status === 'rejected';

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
      <header>
        <Link
          href="/profile"
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-medium"
        >
          <ArrowLeft className="size-3.5" /> โปรไฟล์
        </Link>
        <h1 className="font-display text-ink mt-2 text-2xl font-medium tracking-tight">
          เปิดรับรายได้
        </h1>
        <p className="text-muted mt-1 text-sm">
          ยืนยันตัวตนครั้งเดียว แล้วรายได้จากแพลนสาธารณะจะโอนเข้าบัญชีของคุณทุกรอบ
        </p>
      </header>

      <StatusBanner v={v} />

      <div className="space-y-2.5">
        {KYC_STEPS.map((step, index) => (
          <StepCard
            key={step}
            index={index + 1}
            step={step}
            v={v}
            open={open === step}
            onToggle={() => setOpen(open === step ? null : step)}
          />
        ))}
      </div>

      {canSubmit ? (
        <div className="space-y-2">
          <Button
            block
            size="lg"
            disabled={!allDone || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'กำลังส่ง…' : v.status === 'rejected' ? 'ส่งตรวจอีกครั้ง' : 'ส่งตรวจ'}
          </Button>
          {!allDone ? (
            <p className="text-muted text-center text-xs">กรอกให้ครบทั้ง 4 ขั้นก่อนส่งตรวจ</p>
          ) : null}
          {submit.error ? (
            <p className="text-danger text-center text-xs">{submit.error.message}</p>
          ) : null}
        </div>
      ) : null}

      <p className="text-muted text-[11px] leading-relaxed">
        เลขบัตร รูปบัตร และเลขบัญชีเก็บแบบเข้ารหัส เห็นได้เฉพาะทีมงานที่ตรวจ
        และใช้เพื่อยืนยันตัวตนและโอนรายได้เท่านั้น
      </p>
    </div>
  );
}

function StatusBanner({ v }: { v: Verification }) {
  if (v.status === 'approved') {
    return (
      <Card accent="journal" className="p-4">
        <VerifiedBadge className="bg-bg" />
        <p className="text-ink mt-2 text-sm">
          ยืนยันตัวตนแล้ว{v.verifiedAt ? ` เมื่อ ${formatThaiDate(v.verifiedAt)}` : ''} —
          แก้ได้เฉพาะบัญชีรับเงิน บัญชีใหม่ต้องรอทีมงานตรวจก่อนเข้ารอบโอน
        </p>
      </Card>
    );
  }
  if (v.status === 'submitted') {
    return (
      <Card accent="gray" className="flex items-start gap-3 p-4">
        <Clock className="text-ink mt-0.5 size-4.5 shrink-0" />
        <p className="text-ink text-sm">
          ส่งตรวจแล้ว{v.submittedAt ? ` เมื่อ ${formatThaiDate(v.submittedAt)}` : ''} ·
          ระหว่างรอตรวจแก้ข้อมูลไม่ได้ ผลจะแจ้งในกล่องแจ้งเตือน
        </p>
      </Card>
    );
  }
  if (v.status === 'rejected') {
    return (
      <Card accent="warning" className="flex items-start gap-3 p-4">
        <AlertTriangle className="text-ink mt-0.5 size-4.5 shrink-0" />
        <div className="text-ink text-sm">
          <p className="font-medium">
            ยังไม่ผ่าน — แก้ {v.rejectedSteps.map((step) => KYC_STEP_LABEL[step]).join(', ')} แล้วส่งใหม่
          </p>
          {v.rejectReason ? <p className="mt-1">{v.rejectReason}</p> : null}
        </div>
      </Card>
    );
  }
  if (v.status === 'revoked') {
    return (
      <Card accent="warning" className="flex items-start gap-3 p-4">
        <AlertTriangle className="text-ink mt-0.5 size-4.5 shrink-0" />
        <div className="text-ink text-sm">
          <p className="font-medium">สถานะยืนยันตัวตนถูกระงับ</p>
          <p className="mt-1">{v.rejectReason || 'ติดต่อทีมงานเพื่อสอบถามรายละเอียด'}</p>
        </div>
      </Card>
    );
  }
  return null;
}

/* ------------------------------------------------------------ step card -- */

function StepCard({
  index,
  step,
  v,
  open,
  onToggle,
}: {
  index: number;
  step: KycStepKey;
  v: Verification;
  open: boolean;
  onToggle: () => void;
}) {
  const editable = v.editableSteps.includes(step);
  const done = v.steps[step];
  const rejected = v.status === 'rejected' && v.rejectedSteps.includes(step);

  return (
    <Card
      className={cn(
        'overflow-hidden',
        rejected ? 'bg-orange-light' : 'bg-surface',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          className={cn(
            'nums flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
            done && !rejected ? 'bg-green-solid text-ink' : 'bg-bg text-ink',
          )}
        >
          {done && !rejected ? <Check className="size-3.5" strokeWidth={3} /> : index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-sm font-medium">{KYC_STEP_LABEL[step]}</span>
          <span className="text-muted block truncate text-[11px]">{summaryOf(step, v)}</span>
        </span>
        {!editable ? <Lock className="text-muted size-3.5 shrink-0" aria-label="แก้ไม่ได้ตอนนี้" /> : null}
        <ChevronDown className={cn('text-muted size-4 shrink-0 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="border-border border-t p-4">
          {!editable ? (
            <p className="text-muted mb-3 flex items-center gap-1.5 text-xs">
              <Lock className="size-3.5" /> ขั้นนี้แก้ไม่ได้ตอนนี้
            </p>
          ) : null}
          {step === 'basic' ? <BasicStep v={v} editable={editable} /> : null}
          {step === 'identity' ? <IdentityStep v={v} editable={editable} /> : null}
          {step === 'documents' ? <DocumentsStep v={v} editable={editable} /> : null}
          {step === 'account' ? <AccountStep v={v} editable={editable} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

function summaryOf(step: KycStepKey, v: Verification) {
  switch (step) {
    case 'basic': {
      if (!v.legalName) return 'ชื่อจริง เบอร์โทร อีเมล';
      const pending = [!v.phoneVerified && 'เบอร์โทร', !v.emailVerified && 'อีเมล'].filter(Boolean);
      return pending.length > 0 ? `${v.legalName} · ยังไม่ยืนยัน${pending.join('และ')}` : v.legalName;
    }
    case 'identity':
      return v.idNumberLast4
        ? `ลงท้าย ${v.idNumberLast4}`
        : v.legalType === 'juristic'
          ? 'เลขประจำตัวผู้เสียภาษี'
          : 'เลขบัตรประชาชน 13 หลัก';
    case 'documents':
      return v.hasIdCard && v.hasSelfie
        ? 'อัปโหลดครบแล้ว'
        : v.hasIdCard || v.hasSelfie
          ? 'อัปโหลดแล้ว 1 จาก 2 รูป'
          : 'รูปบัตรและเซลฟี่คู่บัตร';
    case 'account':
      if (!v.account) return 'บัญชีธนาคารหรือพร้อมเพย์';
      return `${accountLabel(v.account.kind, v.account.bankCode, v.account.numberLast4)} · ${ACCOUNT_STATUS[v.account.status]}`;
  }
}

const ACCOUNT_STATUS: Record<string, string> = {
  pending: 'รอตรวจ',
  verified: 'ตรวจแล้ว',
  rejected: 'ใช้ไม่ได้',
  replaced: 'เลิกใช้แล้ว',
};

function ErrorLine({ error }: { error: Error | null }) {
  return error ? <p className="text-danger text-xs">{error.message}</p> : null;
}

/* ---------------------------------------------------------------- basic -- */

function BasicStep({ v, editable }: { v: Verification; editable: boolean }) {
  const save = useSaveVerificationBasic();
  const [legalType, setLegalType] = useState(v.legalType);
  const [legalName, setLegalName] = useState(v.legalName);
  const [phone, setPhone] = useState(v.phone);
  const [email, setEmail] = useState(v.email);

  const dirty =
    legalType !== v.legalType || legalName !== v.legalName || phone !== v.phone || email !== v.email;

  return (
    <div className="space-y-3.5">
      <div role="group" aria-label="ผู้สมัครเป็น">
        <span className="text-muted mb-1.5 block text-[11px] font-medium">ผู้สมัครเป็น</span>
        <div className="flex gap-1.5">
          {(
            [
              ['individual', 'บุคคลธรรมดา'],
              ['juristic', 'นิติบุคคล'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={!editable}
              aria-pressed={legalType === value}
              onClick={() => setLegalType(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-60',
                legalType === value ? 'bg-ink text-bg' : 'bg-bg text-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Field
        label={legalType === 'juristic' ? 'ชื่อนิติบุคคล' : 'ชื่อ-นามสกุลจริง'}
        hint="ต้องตรงกับชื่อบัญชีที่รับเงิน"
      >
        <Input value={legalName} disabled={!editable} onChange={(e) => setLegalName(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="เบอร์โทร">
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            disabled={!editable}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
          />
        </Field>
        <Field label="อีเมล">
          <Input
            type="email"
            value={email}
            disabled={!editable}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>

      {editable && (dirty || !v.legalName) ? (
        <>
          <ErrorLine error={save.error} />
          <Button
            size="sm"
            disabled={save.isPending || !legalName.trim() || !phone.trim() || !email.trim()}
            onClick={() =>
              save.mutate(
                { legalType, legalName, phone, email },
                {
                  // The API normalises the phone and email; take its spelling back.
                  onSuccess: (saved) => {
                    setLegalName(saved.legalName);
                    setPhone(saved.phone);
                    setEmail(saved.email);
                  },
                },
              )
            }
          >
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
          {v.legalName ? (
            <p className="text-muted text-[11px]">เปลี่ยนเบอร์หรืออีเมล ต้องยืนยันรหัสใหม่</p>
          ) : null}
        </>
      ) : null}

      {v.legalName && !dirty ? (
        <div className="space-y-2">
          <OtpRow channel="phone" target={v.phone} verified={v.phoneVerified} editable={editable} />
          <OtpRow channel="email" target={v.email} verified={v.emailVerified} editable={editable} />
        </div>
      ) : null}
    </div>
  );
}

function OtpRow({
  channel,
  target,
  verified,
  editable,
}: {
  channel: 'phone' | 'email';
  target: string;
  verified: boolean;
  editable: boolean;
}) {
  const send = useSendOtp();
  const check = useVerifyOtp();
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const label = channel === 'phone' ? 'เบอร์โทร' : 'อีเมล';

  if (verified) {
    return (
      <p className="text-ink flex items-center gap-1.5 text-xs">
        <Check className="size-3.5" strokeWidth={3} /> ยืนยัน{label}แล้ว · <span className="nums">{target}</span>
      </p>
    );
  }
  if (!editable) {
    return <p className="text-muted text-xs">ยังไม่ได้ยืนยัน{label}</p>;
  }

  return (
    <div className="bg-bg rounded-brand-sm space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink text-xs">
          ยืนยัน{label} <span className="nums text-muted">{target}</span>
        </p>
        <Button
          size="sm"
          variant="soft"
          disabled={send.isPending || wait > 0}
          onClick={() =>
            send.mutate(channel, {
              onSuccess: (result) => {
                setSent(result);
                setWait(OTP_RESEND_SECONDS);
              },
            })
          }
        >
          {send.isPending
            ? 'กำลังส่ง…'
            : wait > 0
              ? `ขอใหม่ได้ใน ${wait} วิ`
              : sent
                ? 'ส่งรหัสอีกครั้ง'
                : 'ส่งรหัส'}
        </Button>
      </div>
      <ErrorLine error={send.error} />
      {sent ? (
        <>
          {sent.devCode ? (
            <p className="text-muted text-[11px]">
              โหมดทดสอบ: รหัสคือ <span className="nums text-ink font-medium">{sent.devCode}</span>
            </p>
          ) : null}
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(digits(e.target.value))}
              placeholder="รหัส 6 หลัก"
              className="nums"
            />
            <Button
              size="sm"
              className="h-auto shrink-0"
              disabled={code.length !== 6 || check.isPending}
              onClick={() => check.mutate({ channel, code })}
            >
              ยืนยัน
            </Button>
          </div>
          <ErrorLine error={check.error} />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- identity -- */

function IdentityStep({ v, editable }: { v: Verification; editable: boolean }) {
  const save = useSaveVerificationIdentity();
  const [value, setValue] = useState('');
  const number = digits(value);
  const juristic = v.legalType === 'juristic';
  const invalid = number.length === 13 && !validThaiId(number);

  return (
    <div className="space-y-3">
      {v.idNumberLast4 ? (
        <p className="text-ink flex items-center gap-1.5 text-xs">
          <Check className="size-3.5" strokeWidth={3} /> บันทึกแล้ว ลงท้าย{' '}
          <span className="nums">{v.idNumberLast4}</span>
        </p>
      ) : null}
      {editable ? (
        <>
          <Field
            label={juristic ? 'เลขประจำตัวผู้เสียภาษี 13 หลัก' : 'เลขบัตรประชาชน 13 หลัก'}
            hint={v.idNumberLast4 ? 'กรอกใหม่เพื่อเปลี่ยน' : 'ใช้ยืนยันได้กับบัญชีเดียวเท่านั้น'}
          >
            <Input
              inputMode="numeric"
              maxLength={17}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="nums"
            />
          </Field>
          {invalid ? (
            <p className="text-danger text-xs">
              {juristic ? 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง' : 'เลขบัตรประชาชนไม่ถูกต้อง'}
            </p>
          ) : null}
          <ErrorLine error={save.error} />
          <Button
            size="sm"
            disabled={!validThaiId(number) || save.isPending}
            onClick={() => save.mutate(number, { onSuccess: () => setValue('') })}
          >
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ documents -- */

function DocumentsStep({ v, editable }: { v: Verification; editable: boolean }) {
  const upload = useUploadVerificationDocuments();
  const [idCard, setIdCard] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  return (
    <div className="space-y-4">
      {editable ? (
        <div className="bg-bg rounded-brand-sm grid items-center gap-3 p-3 sm:grid-cols-[220px_1fr]">
          <IdCardExample className="mx-auto w-full max-w-[220px]" />
          <ul className="text-ink list-disc space-y-1 pl-4 text-xs leading-relaxed">
            <li>
              <span className="font-medium">ก่อนถ่าย</span> ใช้กระดาษหรือนิ้วปิดช่องศาสนาและกรุ๊ปเลือดบนบัตร
              — ระบบไม่แก้รูปให้
            </li>
            <li>ถ่ายให้เห็นทั้งใบ ตัวหนังสืออ่านได้ ไม่มีแสงสะท้อน</li>
            <li>เซลฟี่: ถือบัตรไว้ข้างหน้า เห็นหน้าและบัตรชัดในรูปเดียว</li>
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <PhotoPicker
          label="รูปบัตร"
          uploaded={v.hasIdCard}
          file={idCard}
          onPick={setIdCard}
          editable={editable}
        />
        <PhotoPicker
          label="เซลฟี่คู่บัตร"
          uploaded={v.hasSelfie}
          file={selfie}
          onPick={setSelfie}
          editable={editable}
        />
      </div>

      {editable ? (
        <>
          <ErrorLine error={upload.error} />
          <Button
            size="sm"
            disabled={(!idCard && !selfie) || upload.isPending}
            onClick={() =>
              upload.mutate(
                { idCard: idCard ?? undefined, selfie: selfie ?? undefined },
                {
                  onSuccess: () => {
                    setIdCard(null);
                    setSelfie(null);
                  },
                },
              )
            }
          >
            {upload.isPending ? 'กำลังอัปโหลด…' : 'อัปโหลด'}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function PhotoPicker({
  label,
  uploaded,
  file,
  onPick,
  editable,
}: {
  label: string;
  uploaded: boolean;
  file: File | null;
  onPick: (file: File | null) => void;
  editable: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the picked file
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="bg-bg rounded-brand-sm p-3">
      <p className="text-ink flex items-center justify-between text-xs font-medium">
        {label}
        {uploaded ? (
          <span className="text-muted flex items-center gap-1 text-[11px] font-normal">
            <Check className="size-3" strokeWidth={3} /> อัปโหลดแล้ว
          </span>
        ) : null}
      </p>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never optimised
        <img src={preview} alt="" className="rounded-brand-sm mt-2 h-28 w-full object-cover" />
      ) : null}
      {editable ? (
        <label className="text-primary mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
          <Camera className="size-3.5" />
          {file ? 'เลือกรูปใหม่' : uploaded ? 'ถ่าย/เลือกรูปใหม่' : 'ถ่ายหรือเลือกรูป'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- account -- */

function AccountStep({ v, editable }: { v: Verification; editable: boolean }) {
  const save = useSaveVerificationAccount();
  const [kind, setKind] = useState<'bank' | 'promptpay'>(v.account?.kind ?? 'bank');
  const [bankCode, setBankCode] = useState(v.account?.bankCode || '');
  const [number, setNumber] = useState('');
  const [accountName, setAccountName] = useState(v.account?.accountName || v.legalName);

  const n = digits(number);
  const numberOk = kind === 'bank' ? n.length >= 10 && n.length <= 15 : n.length === 10 || n.length === 13;
  const nameMismatch =
    v.legalName && accountName.trim() && accountName.trim().replace(/\s+/g, ' ') !== v.legalName;

  return (
    <div className="space-y-3.5">
      {v.account ? (
        <div className="bg-bg rounded-brand-sm p-3 text-xs">
          <p className="text-ink">
            บัญชีปัจจุบัน{' '}
            <span className="nums font-medium">
              {accountLabel(v.account.kind, v.account.bankCode, v.account.numberLast4)}
            </span>{' '}
            · {v.account.accountName}
          </p>
          <p className="text-muted mt-0.5">
            {ACCOUNT_STATUS[v.account.status]}
            {v.account.status === 'rejected' && v.account.rejectReason ? ` — ${v.account.rejectReason}` : ''}
          </p>
        </div>
      ) : null}

      {editable ? (
        <>
          <div className="flex gap-1.5" role="group" aria-label="รับเงินทาง">
            {(
              [
                ['bank', 'บัญชีธนาคาร'],
                ['promptpay', 'พร้อมเพย์'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                  kind === value ? 'bg-ink text-bg' : 'bg-bg text-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {kind === 'bank' ? (
            <Field label="ธนาคาร">
              <Select value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                <option value="">เลือกธนาคาร</option>
                {THAI_BANKS.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label={kind === 'bank' ? 'เลขบัญชี' : 'เบอร์โทรหรือเลขบัตรที่ผูกพร้อมเพย์'}
            hint={v.account ? 'กรอกเลขเต็มอีกครั้ง แม้จะเป็นบัญชีเดิม' : undefined}
          >
            <Input
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="nums"
            />
          </Field>
          <Field label="ชื่อบัญชี" hint="ต้องตรงกับชื่อที่กรอกในขั้นแรก">
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </Field>
          {nameMismatch ? (
            <p className="text-muted text-xs">ชื่อบัญชีไม่ตรงกับ “{v.legalName}” — ทีมงานอาจไม่อนุมัติ</p>
          ) : null}
          {v.status === 'approved' ? (
            <p className="text-muted text-[11px]">
              บัญชีใหม่ต้องให้ทีมงานตรวจก่อน ระหว่างนี้รายได้ทบไปรอบถัดไป ป้ายยืนยันตัวตนยังอยู่
            </p>
          ) : null}
          <ErrorLine error={save.error} />
          <Button
            size="sm"
            disabled={!numberOk || !accountName.trim() || (kind === 'bank' && !bankCode) || save.isPending}
            onClick={() =>
              save.mutate(
                { kind, bankCode, accountNumber: n, accountName },
                { onSuccess: () => setNumber('') },
              )
            }
          >
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึกบัญชี'}
          </Button>
        </>
      ) : null}
    </div>
  );
}
