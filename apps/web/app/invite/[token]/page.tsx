'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Users } from 'lucide-react';

import { loginHref, useMe } from '@/features/auth/queries';
import { tripApi } from '@/features/trip/api';
import { Logo } from '@/components/common/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { formatDateRange } from '@/lib/format';
import type { InvitePreview } from '@/types/api';

/**
 * W2.4 — the invite landing page.
 *
 * The preview renders before sign-in, deliberately: being asked to log in
 * before you can see what you are joining is how invite links get ignored.
 */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const { data: me, isLoading: meLoading } = useMe();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;

    tripApi
      .previewInvite(token)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function join() {
    setJoining(true);
    try {
      const result = await tripApi.acceptInvite(token);
      router.push(`/t/${result.trip_id}`);
    } catch (err) {
      setError((err as Error).message);
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Logo href={null} size="lg" className="mx-auto mb-8 text-espresso" />

      {error ? (
        <ErrorState title="ลิงก์นี้ใช้ไม่ได้แล้ว" description={error} />
      ) : !preview ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card>
          <p className="section-label mb-2">คุณถูกชวนเข้าทริป</p>
          <h1 className="font-display text-xl leading-tight">{preview.title}</h1>

          <dl className="mt-3 space-y-1.5 text-sm text-muted">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <dd>{formatDateRange(preview.start_date, preview.end_date)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0" />
              <dd>ตอนนี้มี {preview.member_count} คนในห้อง</dd>
            </div>
          </dl>

          <div className="mt-5">
            {meLoading ? (
              <Skeleton className="h-11 w-full" />
            ) : me ? (
              <Button full loading={joining} onClick={join}>
                เข้าร่วมทริป
              </Button>
            ) : (
              <>
                <a
                  href={loginHref('line', `/invite/${token}`)}
                  className="flex h-11 w-full items-center justify-center rounded-brand bg-primary text-sm font-medium text-primary-fg"
                >
                  เข้าสู่ระบบด้วย LINE เพื่อเข้าร่วม
                </a>
                <a
                  href={loginHref('google', `/invite/${token}`)}
                  className="mt-2 flex h-11 w-full items-center justify-center rounded-brand border border-border bg-surface text-sm font-medium text-espresso"
                >
                  ใช้ Google แทน
                </a>
              </>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-muted">
            เข้าร่วมแล้วจะเห็นแพลนและใส่ที่อยากไปของตัวเองได้
          </p>
        </Card>
      )}
    </main>
  );
}
