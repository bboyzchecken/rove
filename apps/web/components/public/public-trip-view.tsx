'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bus, Car, Copy, Eye, EyeOff, Footprints, TrainFront, Wand2 } from 'lucide-react';

import { BrowseShell } from '@/components/common/browse-shell';
import { AdaptDialog } from '@/components/public/adapt-dialog';
import { ReviewLine, ReviewSummaryLine } from '@/components/trip/trip-review';
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

export function PublicTripView({
  tokenOrSlug,
  // Defaults to the public frame: `/s/[shareToken]` is an unlisted link that
  // is usually opened by somebody outside the app, and `/p/[slug]` passes the
  // real answer.
  signedIn = false,
}: {
  tokenOrSlug: string;
  signedIn?: boolean;
}) {
  const { data, isLoading } = usePublicTrip(tokenOrSlug);
  const { data: me } = useMe();
  const cloneTrip = useCloneFromPublic();
  const [adapting, setAdapting] = useState(false);
  const router = useRouter();

  if (isLoading) {
    return (
      <BrowseShell signedIn={signedIn}>
        <div className="space-y-3 py-8">
          <div className="rounded-brand bg-surface h-40 animate-pulse" />
          <div className="rounded-brand bg-surface h-64 animate-pulse" />
        </div>
      </BrowseShell>
    );
  }

  if (!data) {
    return (
      <BrowseShell signedIn={signedIn} width="focused" center>
        <div className="py-16 text-center">
          <h1 className="font-display text-ink text-xl font-bold">ไม่พบแพลนนี้</h1>
          <p className="text-muted mt-2 text-sm">ลิงก์อาจถูกปิดหรือสร้างใหม่ไปแล้ว</p>
          <ButtonLink href="/explore" className="mt-5">
            ไปหน้าสำรวจ
          </ButtonLink>
        </div>
      </BrowseShell>
    );
  }

  const { trip, days, members, creator, viewCount, cloneCount, reviews, reviewEntries } = data;
  const perPersonJpy = days
    .flatMap((d) => d.items)
    .reduce((sum, item) => sum + (item.costJpy ?? 0), 0);

  const follow = () => {
    cloneTrip.mutate(tokenOrSlug, {
      onSuccess: (copied) => router.push(`/t/${copied.id}` as never),
    });
  };

  return (
    <BrowseShell
      signedIn={signedIn}
      actions={
        <>
          <ButtonLink href="/explore" size="sm" variant="ghost">
            สำรวจแพลนอื่น
          </ButtonLink>
          <ButtonLink href="/new" size="sm" variant="soft">
            เริ่มทริปของฉัน
          </ButtonLink>
        </>
      }
    >
      <Badge tone="outline" className="mt-6">
        แพลนที่แชร์มา
      </Badge>

      <TripCover src={trip.cover} frame="banner" priority className="rounded-brand mt-4" />

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-2xl font-bold tracking-tight">
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
              โดย <span className="text-ink font-medium">{creator.name}</span>
            </span>
          </Link>
        ) : (
          <span className="flex items-center gap-2">
            <CharacterAvatar characterId={creator.characterId} size="xs" />
            <span className="text-muted text-xs">
              โดย <span className="text-ink font-medium">{creator.name}</span>
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
          <p className="font-display text-ink nums mt-1 text-2xl font-bold">
            {formatMoney(Math.round(perPersonJpy * trip.fxRate), 'THB')}
          </p>
        </Card>
      ) : null}

      {reviews.count > 0 ? (
        <Card className="mt-4 p-4">
          <p className="text-muted text-xs">คนที่ไปมาแล้วบอกว่า</p>
          <div className="mt-2">
            <ReviewSummaryLine summary={reviews} />
          </div>
          {reviewEntries.some((entry) => entry.body) ? (
            <div className="divide-border border-border mt-2 divide-y border-t">
              {reviewEntries
                .filter((entry) => entry.body)
                .slice(0, 3)
                .map((entry) => (
                  <ReviewLine key={entry.userId} review={entry} />
                ))}
            </div>
          ) : null}
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
                    <span className="text-ink nums w-12 shrink-0 text-xs font-medium">
                      {item.start}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink text-sm font-medium">{item.title}</p>
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

      <Card accent="yellow" className="mt-4 p-4">
        <p className="text-ink text-sm font-medium">อยากไปตามแพลนนี้ไหม</p>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          ก๊อปทั้งทริปไปเป็นของตัวเอง — แก้วัน เพิ่มเพื่อน ปรับที่เที่ยวต่อได้เลย
          และเจ้าของแพลนได้แต้มเป็นกำลังใจ
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {me ? (
            <>
              <Button size="sm" onClick={follow} disabled={cloneTrip.isPending}>
                <Copy className="size-3.5" />
                {cloneTrip.isPending ? 'กำลังก๊อป…' : 'เที่ยวตามแพลนนี้'}
              </Button>
              <Button size="sm" variant="soft" onClick={() => setAdapting(true)}>
                <Wand2 className="size-3.5" />
                ปรับให้เข้ากับทริปฉัน
              </Button>
            </>
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

      <AdaptDialog
        open={adapting}
        onClose={() => setAdapting(false)}
        tokenOrSlug={tokenOrSlug}
        source={trip}
      />
    </BrowseShell>
  );
}
