'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Sparkle } from '@/components/brand/doodle';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { BackHome, PublicShell } from '@/components/common/public-shell';
import { Card } from '@/components/ui/card';
import { useMe } from '@/features/auth/queries';
import { safeNext } from '@/lib/auth-redirect';

/**
 * Sign-in (W0.5).
 *
 * Two providers, no password field — ROVE never holds a credential of its own
 * (§privacy: "เราไม่เคยเห็นและไม่เคยเก็บรหัสผ่านของบัญชีเหล่านั้น"). There is no
 * separate sign-up: the API creates the account on the first successful login,
 * so one button covers both and nobody has to guess which one they are.
 *
 * This is the door for people. The staff door is `/admin/login` — same two
 * providers, out of reach of anyone who only ever sees this screen (§16,
 * anti-abuse hardening for the free-AI-plan promo).
 *
 * Everything that can go wrong upstream comes back as `?error=` and is said out
 * loud here. A silent bounce back to this page teaches the user nothing.
 */
const REASONS: Record<string, string> = {
  provider: 'ยังไม่รองรับผู้ให้บริการนี้',
  unconfigured: 'ช่องทางนี้ยังไม่เปิดใช้งาน ลองอีกช่องทางหรือติดต่อทีมงาน',
  unreachable: 'ต่อกับเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง',
  state: 'ลิงก์เข้าสู่ระบบหมดอายุหรือถูกแก้ไข กดเข้าสู่ระบบใหม่อีกครั้ง',
  missing_code: 'ไม่ได้รับรหัสยืนยันจากผู้ให้บริการ ลองใหม่อีกครั้ง',
  denied: 'คุณยกเลิกการอนุญาต ถ้าเปลี่ยนใจกดเข้าสู่ระบบได้เลย',
  exchange: 'ยืนยันตัวตนไม่สำเร็จ ลองใหม่อีกครั้ง',
};

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: me, isLoading } = useMe();

  const next = safeNext(params.get('next'));
  const errorCode = params.get('error');
  const reason = errorCode ? (REASONS[errorCode] ?? REASONS.exchange) : null;

  // Already signed in — nothing to do on this screen.
  useEffect(() => {
    if (me) router.replace(next as never);
  }, [me, next, router]);

  return (
    <PublicShell width="focused" center actions={<BackHome />}>
      <div className="relative flex flex-col gap-7 py-10">
        {/* One mark, in the margin (§5.3). The door to the product is a task
            screen, not a marketing page — §1 keeps it fully calm, so there is
            no canvas, no tilt and no overlay here. */}
        <Sparkle className="text-ink pointer-events-none absolute -top-2 -right-6 hidden size-12 sm:block" />
        <div className="text-center">
          <div>
            <h1 className="t-h2 text-ink">เข้าสู่ระบบเพื่อเริ่มวางแพลน</h1>
            <p className="text-muted t-small mt-3">
              ใช้บัญชีที่มีอยู่แล้วได้เลย ถ้ายังไม่เคยใช้ ROVE ระบบจะสร้างบัญชีให้อัตโนมัติ
            </p>
          </div>
        </div>

        {/* Not `accent="primary"`: §2.4 locks blue to *action*, and a failed
            sign-in is not one. A bordered white card with danger type says
            "read this" without claiming to be a button. */}
        {reason ? (
          <Card className="border-danger/45 p-4" role="alert">
            <p className="text-danger text-sm font-medium">{reason}</p>
          </Card>
        ) : null}

        <OAuthButtons next={next} disabled={isLoading || Boolean(me)} />

        <p className="text-muted text-center text-xs leading-relaxed">
          การเข้าสู่ระบบถือว่าคุณยอมรับ{' '}
          <a href="/terms" className="text-ink font-medium underline underline-offset-2">
            เงื่อนไขการใช้งาน
          </a>{' '}
          และ{' '}
          <a href="/privacy" className="text-ink font-medium underline underline-offset-2">
            นโยบายความเป็นส่วนตัว
          </a>
        </p>
      </div>
    </PublicShell>
  );
}
