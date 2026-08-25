'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarCheck, Users } from 'lucide-react';

import { PublicShell } from '@/components/common/public-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useCharacters, useMe, useUpdateMe } from '@/features/auth/queries';
import { useInvitePreview, useJoinTrip } from '@/features/trip/queries';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Landing for an invite link (M2 — W2.4).
 *
 * Joining is one tap, and the character pick rides along (W14.3) because the
 * first thing the group will see of this person is their face in the member
 * list — asking for it later means the list is full of defaults.
 *
 * Accepting requires a session (the API's `/invites/:token/join` sits behind
 * `JwtMiddleware`), so an anonymous visitor is bounced to `/login` with this
 * page as `next` before they ever see the join button — otherwise the tap
 * fails with a raw "missing token" instead of a sign-in screen.
 */
export function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: preview, isLoading: previewLoading, error: previewError } = useInvitePreview(token);
  const { data: characters = [] } = useCharacters();
  const join = useJoinTrip();
  const updateMe = useUpdateMe();

  const [character, setCharacter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meLoading && !me) router.replace(`/login?next=/invite/${token}` as never);
  }, [me, meLoading, router, token]);

  async function accept() {
    setError(null);
    try {
      if (character) await updateMe.mutateAsync({ characterId: character });
      const { tripId } = await join.mutateAsync(token);
      router.push(`/t/${tripId}/dates` as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เข้าร่วมไม่สำเร็จ — ลิงก์อาจหมดอายุแล้ว');
    }
  }

  const picked = character ?? me?.characterId ?? 'shiba';

  if (previewError) {
    return (
      <PublicShell width="focused" center>
        <div className="py-16 text-center">
          <h1 className="font-display text-espresso text-xl font-extrabold">
            {previewError instanceof ApiError ? previewError.message : 'ลิงก์เชิญนี้ใช้ไม่ได้แล้ว'}
          </h1>
          <p className="text-muted mt-2 text-sm">ขอลิงก์เชิญใหม่จากเพื่อนที่ชวนมาอีกครั้ง</p>
        </div>
      </PublicShell>
    );
  }

  // Loading the preview, checking the session, or mid-redirect to /login —
  // none of these should flash the join form.
  if (previewLoading || meLoading || !me) {
    return (
      <PublicShell>
        <div className="space-y-3 py-8">
          <div className="rounded-brand bg-surface h-20 animate-pulse" />
          <div className="rounded-brand bg-surface h-40 animate-pulse" />
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <h1 className="font-display text-espresso mt-8 text-2xl font-extrabold tracking-tight">
        เพื่อนชวนคุณเข้าทริป{preview ? ` — ${preview.title}` : ''}
      </h1>
      <p className="text-muted mt-1 text-sm">
        กดเข้าร่วมแล้วใส่วันว่างของตัวเอง — เดี๋ยว ROVE หาวันที่ทุกคนตรงกันให้เอง
      </p>

      <Card accent="sky" className="mt-5 space-y-2.5 p-4">
        <p className="text-espresso flex items-center gap-2 text-sm">
          <Users className="size-4 shrink-0" /> เข้าห้องเดียวกับเพื่อนที่ชวนมา
        </p>
        <p className="text-espresso flex items-center gap-2 text-sm">
          <CalendarCheck className="size-4 shrink-0" /> ขั้นแรกคือแตะวันที่คุณว่าง
        </p>
      </Card>

      <section className="mt-6">
        <p className="section-label mb-2">เลือกตัวละครของคุณ</p>
        <div className="grid grid-cols-5 gap-2">
          {characters.slice(0, 10).map((c) => (
            <button
              key={c.id}
              onClick={() => setCharacter(c.id)}
              className={cn(
                'rounded-2xl p-1.5 transition',
                picked === c.id ? 'bg-espresso' : 'bg-surface',
              )}
              title={c.name}
            >
              <CharacterAvatar characterId={c.id} size="md" className="mx-auto" />
            </button>
          ))}
        </div>
      </section>

      <Button
        block
        size="lg"
        className="mt-6"
        onClick={() => void accept()}
        disabled={join.isPending}
      >
        {join.isPending ? 'กำลังเข้าร่วม…' : 'เข้าร่วมทริป'}
        <ArrowRight className="size-4" />
      </Button>

      {error ? <p className="text-danger mt-3 text-center text-xs">{error}</p> : null}

      <p className="text-muted mt-3 text-center text-[11px]">
        โค้ดเชิญ <span className="nums">{token.slice(0, 12)}</span>
      </p>
    </PublicShell>
  );
}
