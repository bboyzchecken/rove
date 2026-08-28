'use client';

import { useSearchParams } from 'next/navigation';
import { ShieldCheck, Wrench } from 'lucide-react';

import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { BackHome, PublicShell } from '@/components/common/public-shell';
import { Card } from '@/components/ui/card';
import { safeNext } from '@/lib/auth-redirect';
import { env } from '@/lib/env';

/**
 * The staff door — a separate entrance, not a separate kind of credential.
 *
 * `/login` is the door for people signing up to plan a trip; this one is for
 * whoever runs the place. Both use the same two OAuth providers, because the
 * thing that makes someone staff is their address being in the API's
 * ADMIN_EMAILS, checked when the provider hands the profile back
 * (`findOrCreateUser`). A password field here would be a second credential to
 * defend for no extra safety, and a sign-in with nobody vouching for the
 * person is exactly what a script farming free-AI-plan credit wants (§16).
 *
 * Underneath, when the environment allows it, sits the dev bypass: a fixed
 * demo account, always promoted to admin, for a machine that has no OAuth
 * credentials yet. It is gated by NEXT_PUBLIC_DEV_LOGIN plus a non-production
 * NODE_ENV, and `/api/auth/demo` re-checks both server-side. It is an extra on
 * this page, not the reason the page exists — turning it off must still leave
 * a working way in.
 */
const REASONS: Record<string, string> = {
  unconfigured: 'ประตูทดลองยังไม่เปิด — API ต้องรันด้วย DEV_LOGIN=true',
  unreachable: 'ต่อกับเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง',
  provider: 'ยังไม่รองรับผู้ให้บริการนี้',
  state: 'ลิงก์เข้าสู่ระบบหมดอายุหรือถูกแก้ไข กดเข้าสู่ระบบใหม่อีกครั้ง',
  denied: 'คุณยกเลิกการอนุญาต ถ้าเปลี่ยนใจกดเข้าสู่ระบบได้เลย',
  exchange: 'ยืนยันตัวตนไม่สำเร็จ ลองใหม่อีกครั้ง',
};

export function AdminLoginScreen() {
  const params = useSearchParams();
  // Someone who opens this door on purpose wants the admin screens, not /home.
  const next = safeNext(params.get('next') ?? '/admin');
  const errorCode = params.get('error');
  const reason = errorCode ? (REASONS[errorCode] ?? REASONS.unreachable) : null;

  return (
    <PublicShell width="focused" center actions={<BackHome />}>
      <div className="flex flex-col gap-6 py-10">
        <div className="text-center">
          <div>
            <h1 className="font-display text-ink flex items-center justify-center gap-2 text-xl font-bold tracking-tight">
              <ShieldCheck className="size-5" strokeWidth={2.5} />
              เข้าสู่ระบบสำหรับทีมงาน
            </h1>
            <p className="text-muted mt-2 text-sm leading-relaxed">
              ใช้บัญชีเดิมของคุณ สิทธิ์แอดมินมาจากอีเมลที่อยู่ในรายชื่อทีมงาน
            </p>
          </div>
        </div>

        {reason ? (
          <Card accent="primary" className="p-4" role="alert">
            <p className="text-ink text-sm font-medium">{reason}</p>
          </Card>
        ) : null}

        <OAuthButtons next={next} />

        {env.devLogin ? (
          <div className="border-border flex flex-col gap-2 border-t pt-5">
            <p className="text-muted text-center text-[11px]">
              เฉพาะตอนพัฒนา — เครื่องนี้ยังไม่มี OAuth จริง
            </p>
            <a
              href={`/api/auth/demo?next=${encodeURIComponent(next)}`}
              className="border-border text-muted hover:bg-surface flex w-full items-center justify-center gap-2 rounded-full border border-dashed px-4 py-2.5 text-sm font-medium transition"
            >
              <Wrench className="size-4" strokeWidth={2.5} />
              เข้าสู่ระบบด้วยบัญชีทดลอง (admin)
            </a>
          </div>
        ) : null}
      </div>
    </PublicShell>
  );
}
