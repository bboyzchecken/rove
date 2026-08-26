'use client';

import { useEffect } from 'react';

import { StatusPage } from '@/components/common/status-page';
import { Button, ButtonLink } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';

/**
 * The app's error boundary. It splits one case out of the generic crash: the
 * Go API being unreachable, which is not the user's problem to solve and needs
 * a different message ("มันไม่ใช่ที่คุณ, ลองใหม่อีกที") plus a retry rather
 * than a "go home".
 */
function looksLikeBackendDown(error: Error) {
  if (error instanceof ApiError) return error.status >= 500;

  // Caveat worth knowing: in production Next masks errors thrown while
  // rendering on the server — the boundary receives a generic message plus a
  // digest, so neither the class nor the text survives and those land on the
  // generic screen below. This branch is therefore the CLIENT path, which is
  // where TanStack Query lives (§2.1) and where an unreachable API actually
  // shows up. A server component that must show the outage screen should
  // catch its own ApiError and render /maintenance instead of relying on this.
  return /fetch failed|failed to fetch|networkerror|econnrefused|502|503|504/i.test(error.message);
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry/PostHog capture goes here once observability lands (§13).
    console.error(error);
  }, [error]);

  const backendDown = looksLikeBackendDown(error);

  return backendDown ? (
    <StatusPage
      image="/brand/status/status-maintenance.webp"
      code="503"
      tone="sun"
      title="ระบบหลังบ้านไม่ตอบ"
      hint="ตอนนี้ต่อกับเซิร์ฟเวอร์ของ ROVE ไม่ได้ ไม่ใช่ที่เครื่องคุณ — แพลนที่บันทึกไว้ยังอยู่ครบ รอสักครู่แล้วลองใหม่ได้เลย"
      actions={
        <Button size="lg" block onClick={reset}>
          ลองใหม่อีกครั้ง
        </Button>
      }
      detail={
        <>
          ถ้ายังไม่หายใน 5 นาที ส่งรหัสนี้ให้ทีมงานได้เลย
          <br />
          <span className="nums">{error.digest ?? error.message}</span>
        </>
      }
    />
  ) : (
    <StatusPage
      image="/brand/status/status-error.webp"
      code="500"
      tone="primary"
      title="หน้านี้พังไปหนึ่งจุด"
      hint="เราบันทึกข้อผิดพลาดไว้แล้ว ลองโหลดใหม่ก่อน ถ้ายังเป็นซ้ำที่เดิม บอกทีมงานพร้อมรหัสด้านล่างได้เลย"
      actions={
        <>
          <Button size="lg" block onClick={reset}>
            โหลดหน้านี้ใหม่
          </Button>
          <ButtonLink href="/home" variant="outline" size="lg" block>
            ไปหน้าสรุปของฉัน
          </ButtonLink>
        </>
      }
      detail={<span className="nums">{error.digest ?? error.message}</span>}
    />
  );
}
