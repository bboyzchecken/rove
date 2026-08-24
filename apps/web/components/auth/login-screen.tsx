'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';

import { RoveLogo } from '@/components/brand/rove-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLogin, useMe } from '@/features/auth/queries';
import { safeNext } from '@/lib/auth-redirect';

/**
 * Sign-in (W0.5).
 *
 * Two providers, no password field — ROVE never holds a credential of its own
 * (§privacy: "เราไม่เคยเห็นและไม่เคยเก็บรหัสผ่านของบัญชีเหล่านั้น"). There is no
 * separate sign-up: the API creates the account on the first successful login,
 * so one button covers both and nobody has to guess which one they are.
 *
 * This is the only door in — no password field, no dev bypass. The dev-only
 * demo login lives at `/admin/login` instead, out of reach of anyone who only
 * ever sees this screen (§16, anti-abuse hardening for the free-AI-plan promo).
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
  const login = useLogin();
  const { data: me, isLoading } = useMe();

  const next = safeNext(params.get('next'));
  const errorCode = params.get('error');
  const reason = errorCode ? (REASONS[errorCode] ?? REASONS.exchange) : null;

  // Already signed in — nothing to do on this screen.
  useEffect(() => {
    if (me) router.replace(next as never);
  }, [me, next, router]);

  const signIn = (provider: 'line' | 'google') => {
    login.mutate(
      { provider, next },
      {
        // Mock mode signs in without leaving the page, so the navigation that
        // live mode gets from its redirect has to happen here instead.
        onSuccess: (result) => {
          if (!result.redirectUrl && result.user) router.replace(next as never);
        },
      },
    );
  };

  const busy = login.isPending || isLoading || Boolean(me);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 px-5 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <RoveLogo size="md" />
        <div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            เข้าสู่ระบบเพื่อเริ่มวางแพลน
          </h1>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            ใช้บัญชีที่มีอยู่แล้วได้เลย ถ้ายังไม่เคยใช้ ROVE ระบบจะสร้างบัญชีให้อัตโนมัติ
          </p>
        </div>
      </div>

      {reason ? (
        <Card accent="primary" className="p-4" role="alert">
          <p className="text-espresso text-sm font-semibold">{reason}</p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button
          size="lg"
          block
          onClick={() => signIn('line')}
          disabled={busy}
          aria-label="เข้าสู่ระบบด้วย LINE"
        >
          <MessageCircle className="size-5" strokeWidth={2.5} />
          เข้าสู่ระบบด้วย LINE
        </Button>

        <Button
          size="lg"
          variant="outline"
          block
          onClick={() => signIn('google')}
          disabled={busy}
          aria-label="เข้าสู่ระบบด้วย Google"
        >
          <GoogleMark />
          เข้าสู่ระบบด้วย Google
        </Button>
      </div>

      {login.isError ? (
        <p className="text-muted text-center text-sm">
          เริ่มการเข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง
        </p>
      ) : null}

      <p className="text-muted text-center text-xs leading-relaxed">
        การเข้าสู่ระบบถือว่าคุณยอมรับ{' '}
        <a href="/terms" className="text-espresso font-semibold underline underline-offset-2">
          เงื่อนไขการใช้งาน
        </a>{' '}
        และ{' '}
        <a href="/privacy" className="text-espresso font-semibold underline underline-offset-2">
          นโยบายความเป็นส่วนตัว
        </a>
      </p>
    </div>
  );
}

/** Google's mark, inline — lucide has no brand icons and a CDN is not an option. */
function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.56-5.17 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.36v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.35 14.31a7.2 7.2 0 0 1 0-4.6V6.62H1.36a12 12 0 0 0 0 10.78l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.36 6.62l3.99 3.09A7.2 7.2 0 0 1 12 4.75Z"
      />
    </svg>
  );
}
