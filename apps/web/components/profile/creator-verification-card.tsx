'use client';

import { ChevronRight, Clock, ShieldCheck } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { VerifiedBadge } from '@/components/profile/verified-badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useVerification } from '@/features/verification/queries';
import { accountLabel } from '@/lib/catalog/banks';
import { KYC_STEP_LABEL, KYC_STEPS } from '@/lib/kyc';

/**
 * เปิดรับรายได้ (Feedback #4 — D-37).
 *
 * Always on the profile, and read like a marketplace's verified-seller status
 * rather than a nag: it says where the person stands and the one thing to do
 * next, whatever that is.
 */
export function CreatorVerificationCard() {
  const { data: v, isLoading } = useVerification();

  if (isLoading || !v) {
    return (
      <section>
        <SectionHeader label="เปิดรับรายได้" />
        <div className="rounded-brand bg-surface h-28 animate-pulse" />
      </section>
    );
  }

  const done = KYC_STEPS.filter((step) => v.steps[step]).length;

  return (
    <section>
      <SectionHeader label="เปิดรับรายได้" />
      <Card accent="gray" className="p-4">
        {v.status === 'approved' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <VerifiedBadge />
              <ButtonLink href={'/profile/verify' as never} size="sm" variant="soft">
                เปลี่ยนบัญชีรับเงิน
              </ButtonLink>
            </div>
            {v.account ? (
              <p className="text-ink mt-3 text-sm">
                รับเงินเข้า{' '}
                <span className="nums font-medium">
                  {accountLabel(v.account.kind, v.account.bankCode, v.account.numberLast4)}
                </span>
              </p>
            ) : null}
            {v.account?.status === 'pending' ? (
              <p className="text-muted mt-1 flex items-center gap-1.5 text-xs">
                <Clock className="size-3.5" /> รอตรวจบัญชีใหม่ — รอบที่ยังไม่ผ่านตรวจจะทบไปรอบถัดไป
              </p>
            ) : v.account?.status === 'rejected' ? (
              <p className="text-danger mt-1 text-xs">
                บัญชีใหม่ยังใช้ไม่ได้: {v.account.rejectReason}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex items-start gap-3">
            <span className="bg-bg flex size-9 shrink-0 items-center justify-center rounded-2xl">
              <ShieldCheck className="text-ink size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              {v.status === 'submitted' ? (
                <>
                  <p className="font-display text-ink font-medium">ส่งตรวจแล้ว · รอตรวจ</p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ทีมงานกำลังตรวจข้อมูล ผลจะแจ้งในกล่องแจ้งเตือน
                  </p>
                </>
              ) : v.status === 'rejected' ? (
                <>
                  <p className="font-display text-ink font-medium">
                    ต้องแก้ไข: {v.rejectedSteps.map((step) => KYC_STEP_LABEL[step]).join(', ')}
                  </p>
                  {v.rejectReason ? (
                    <p className="text-muted mt-1 text-xs leading-relaxed">{v.rejectReason}</p>
                  ) : null}
                  <ButtonLink href={'/profile/verify' as never} size="sm" className="mt-3">
                    แก้ไขแล้วส่งใหม่ <ChevronRight className="size-3.5" />
                  </ButtonLink>
                </>
              ) : v.status === 'revoked' ? (
                <>
                  <p className="font-display text-ink font-medium">สถานะยืนยันตัวตนถูกระงับ</p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    {v.rejectReason || 'ติดต่อทีมงานเพื่อสอบถามรายละเอียด'}
                  </p>
                </>
              ) : done === 0 ? (
                <>
                  <p className="font-display text-ink font-medium">
                    ยืนยันตัวตนครั้งเดียว รับรายได้จากแพลนของคุณเข้าบัญชีทุกรอบ
                  </p>
                  <p className="text-muted mt-1 text-xs leading-relaxed">
                    ใช้ชื่อจริง เบอร์โทร อีเมล เลขบัตรประชาชน รูปบัตรกับเซลฟี่ และบัญชีธนาคารหรือพร้อมเพย์ที่ชื่อตรงกัน
                  </p>
                  <ButtonLink href={'/profile/verify' as never} size="sm" className="mt-3">
                    เริ่มยืนยันตัวตน <ChevronRight className="size-3.5" />
                  </ButtonLink>
                </>
              ) : (
                <>
                  <p className="font-display text-ink font-medium">
                    กรอกแล้ว <span className="nums">{done}/4</span> ขั้น
                  </p>
                  <Progress value={done / 4} tone="ink" className="mt-2" />
                  <ButtonLink href={'/profile/verify' as never} size="sm" className="mt-3">
                    {done === 4 ? 'ตรวจแล้วส่ง' : 'ทำต่อ'} <ChevronRight className="size-3.5" />
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
