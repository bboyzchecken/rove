'use client';

import { useSearchParams } from 'next/navigation';
import { Wrench } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { safeNext } from '@/lib/auth-redirect';
import { env } from '@/lib/env';

/**
 * The developer/admin door — not linked from `/login`.
 *
 * `/login` is OAuth-only (LINE, Google) for every real sign-in, because a
 * plain sign-in with no third party to vouch for the person is exactly what a
 * script farming free-AI-plan credit or referral points would want (§16,
 * trip-planning-platform-plan.md §11). This route exists only so the same
 * mock-mode bypass that used to sit on the public screen still has a door —
 * just one nobody stumbles into by visiting the app's own login page.
 *
 * Still gated by the same three independent switches as before
 * (`/api/auth/demo`): NEXT_PUBLIC_DEV_LOGIN=true, non-production, and the API
 * running with MOCK_MODE=true. The account it signs into is always promoted
 * to admin — this door is not a way to test as an ordinary user.
 */
const REASONS: Record<string, string> = {
  unconfigured: 'ประตูนี้ยังไม่เปิด — API ต้องรันด้วย MOCK_MODE=true',
  unreachable: 'ต่อกับเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง',
};

export function AdminLoginScreen() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const errorCode = params.get('error');
  const reason = errorCode ? (REASONS[errorCode] ?? REASONS.unreachable) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-espresso text-xl font-extrabold tracking-tight">
          ประตูสำหรับนักพัฒนา
        </h1>
        <p className="text-muted text-sm leading-relaxed">
          ใช้ได้เฉพาะตอนพัฒนาเท่านั้น บัญชีที่ได้จะเป็นสิทธิ์ admin เสมอ
        </p>
      </div>

      {reason ? (
        <Card accent="primary" className="p-4" role="alert">
          <p className="text-espresso text-sm font-semibold">{reason}</p>
        </Card>
      ) : null}

      {env.devLogin ? (
        <a
          href={`/api/auth/demo?next=${encodeURIComponent(next)}`}
          className="border-border text-muted hover:bg-surface flex w-full items-center justify-center gap-2 rounded-full border border-dashed px-4 py-2.5 text-sm font-semibold transition"
        >
          <Wrench className="size-4" strokeWidth={2.5} />
          เข้าสู่ระบบด้วยบัญชีทดลอง (admin)
        </a>
      ) : (
        <Card className="p-4">
          <p className="text-muted text-center text-sm">
            ยังไม่ได้เปิด NEXT_PUBLIC_DEV_LOGIN — ไม่มีประตูให้เข้า
          </p>
        </Card>
      )}
    </div>
  );
}
