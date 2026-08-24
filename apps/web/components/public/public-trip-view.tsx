'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bus, Car, Copy, Eye, EyeOff, Footprints, TrainFront } from 'lucide-react';

import { RoveLogo } from '@/components/brand/rove-logo';
import { SectionHeader } from '@/components/common/section';
import { TripCover } from '@/components/trip/trip-cover';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar, CharacterStack } from '@/components/ui/character-avatar';
import { useMe } from '@/features/auth/queries';
import { useCloneFromPublic } from '@/features/public/queries';
import { usePublicTrip } from '@/features/trip/queries';
import { thaiRangeLabel } from '@/lib/data/domain';
import { formatMoney } from '@/lib/format';

/**
 * Read-only trip view behind a share token or a public slug (M10 — W10.2).
 *
 * Money is deliberately partial here: per-item estimates are part of what
 * makes a shared plan useful, but the group's actual spending and who owes
 * whom never leaves the room (W16.5).
 */
const TRAVEL_ICON = { train: TrainFront, walk: Footprints, bus: Bus, car: Car };

export function PublicTripView({ tokenOrSlug }: { tokenOrSlug: string }) {
  const { data, isLoading } = usePublicTrip(tokenOrSlug);
  const { data: me } = useMe();
  const cloneTrip = useCloneFromPublic();
  const router = useRouter();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-3 px-4 py-10">
        <div className="rounded-brand bg-surface h-40 animate-pulse" />
        <div className="rounded-brand bg-surface h-64 animate-pulse" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <RoveLogo size="md" className="mx-auto" />
        <h1 className="font-display text-espresso mt-6 text-xl font-extrabold">ไม่พบแพลนนี้</h1>
        <p className="text-muted mt-2 text-sm">ลิงก์อาจถูกปิดหรือสร้างใหม่ไปแล้ว</p>
        <ButtonLink href="/" className="mt-5">
          กลับหน้าแรก
        </ButtonLink>
      </main>
    );
  }

  const { trip, days, members, creator, viewCount, cloneCount } = data;
  const perPersonJpy = days
    .flatMap((d) => d.items)
    .reduce((sum, item) => sum + (item.costJpy ?? 0), 0);

  const follow = () => {
    cloneTrip.mutate(tokenOrSlug, {
      onSuccess: (copied) => router.push(`/t/${copied.id}` as never),
    });
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <RoveLogo size="sm" />
        <Badge tone="outline">แพลนที่แชร์มา</Badge>
      </div>

      <TripCover src={trip.cover} frame="banner" priority className="rounded-brand mt-4" />

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            {trip.title}
          </h1>
          <p className="text-muted mt-0.5 text-sm">
            {trip.startDate && trip.endDate
              ? `${thaiRangeLabel(trip.startDate, trip.endDate)} · `
              : ''}
            {trip.nights + 1} วัน {trip.nights} คืน · {trip.cities.join(' · ')}
          </p>
        </div>
        <CharacterStack characterIds={members.map((m) => m.characterId)} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        {creator.handle ? (
          <Link
            href={`/u/${creator.handle}` as never}
            className="flex items-center gap-2 transition hover:opacity-80"
          >
            <CharacterAvatar characterId={creator.characterId} size="xs" />
            <span className="text-muted text-xs">
              โดย <span className="text-espresso font-semibold">{creator.name}</span>
            </span>
          </Link>
        ) : (
          <span className="flex items-center gap-2">
            <CharacterAvatar characterId={creator.characterId} size="xs" />
            <span className="text-muted text-xs">
              โดย <span className="text-espresso font-semibold">{creator.name}</span>
            </span>
          </span>
        )}

        <span className="text-muted flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <Eye className="size-3" />
            {viewCount.toLocaleString('th-TH')}
          </span>
          <span className="flex items-center gap-1">
            <Copy className="size-3" />
            {cloneCount.toLocaleString('th-TH')} คนตามรอย
          </span>
        </span>
      </div>

      {perPersonJpy > 0 ? (
        <Card accent="primary" className="mt-4 p-4">
          <p className="text-muted text-xs">ค่าใช้จ่ายโดยประมาณต่อคน (เฉพาะที่อยู่ในแพลน)</p>
          <p className="font-display text-espresso nums mt-1 text-2xl font-extrabold">
            {formatMoney(Math.round(perPersonJpy * trip.fxRate), 'THB')}
          </p>
        </Card>
      ) : null}

      <section className="mt-6 space-y-5">
        {days.map((day) => (
          <div key={day.id}>
            <SectionHeader label={`${day.label} · ${day.city}`} />
            <Card className="divide-border divide-y">
              {day.items.map((item) => {
                const Icon = item.travel ? TRAVEL_ICON[item.travel.mode] : null;
                return (
                  <div key={item.id} className="flex gap-3 p-3.5">
                    <span className="text-espresso nums w-12 shrink-0 text-xs font-medium">
                      {item.start}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-espresso text-sm font-semibold">{item.title}</p>
                      {item.area ? (
                        <p className="text-muted mt-0.5 text-[11px]">{item.area}</p>
                      ) : null}
                      {item.travel && Icon ? (
                        <p className="text-muted mt-1 flex items-center gap-1.5 text-[11px]">
                          <Icon className="size-3" /> ต่อไปอีก {item.travel.minutes} นาที
                        </p>
                      ) : null}
                    </div>
                    {item.costJpy ? (
                      <span className="text-muted nums shrink-0 text-[11px]">
                        ¥{item.costJpy.toLocaleString('en-US')}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          </div>
        ))}
      </section>

      <p className="text-muted mt-6 flex items-start gap-1.5 text-[11px] leading-relaxed">
        <EyeOff className="mt-px size-3.5 shrink-0" />
        ค่าใช้จ่ายจริงและยอดที่หารกันในกลุ่มไม่ถูกแชร์ในลิงก์นี้
      </p>

      <Card accent="sun" className="mt-4 p-4">
        <p className="text-espresso text-sm font-semibold">อยากไปตามแพลนนี้ไหม</p>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          ก๊อปทั้งทริปไปเป็นของตัวเอง — แก้วัน เพิ่มเพื่อน ปรับที่เที่ยวต่อได้เลย
          และเจ้าของแพลนได้แต้มเป็นกำลังใจ
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {me ? (
            <Button size="sm" onClick={follow} disabled={cloneTrip.isPending}>
              <Copy className="size-3.5" />
              {cloneTrip.isPending ? 'กำลังก๊อป…' : 'เที่ยวตามแพลนนี้'}
            </Button>
          ) : (
            <ButtonLink href={`/login?next=/p/${tokenOrSlug}` as never} size="sm">
              <Copy className="size-3.5" />
              เข้าสู่ระบบเพื่อตามรอย
            </ButtonLink>
          )}
          <ButtonLink href="/new" size="sm" variant="soft">
            เริ่มทริปของฉันเอง
          </ButtonLink>
        </div>
        {cloneTrip.isError ? (
          <p className="text-warning mt-2 text-xs">ก๊อปไม่สำเร็จ — ลองใหม่อีกครั้ง</p>
        ) : null}
      </Card>
    </main>
  );
}
