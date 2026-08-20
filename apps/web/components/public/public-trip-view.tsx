'use client';

import Image from 'next/image';
import { Bus, Car, EyeOff, Footprints, TrainFront } from 'lucide-react';

import { RoveLogo } from '@/components/brand/rove-logo';
import { SectionHeader } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterStack } from '@/components/ui/character-avatar';
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
        <h1 className="font-display text-espresso mt-6 text-xl font-extrabold">
          ไม่พบแพลนนี้
        </h1>
        <p className="text-muted mt-2 text-sm">ลิงก์อาจถูกปิดหรือสร้างใหม่ไปแล้ว</p>
        <ButtonLink href="/" className="mt-5">
          กลับหน้าแรก
        </ButtonLink>
      </main>
    );
  }

  const { trip, days, members } = data;
  const perPersonJpy = days
    .flatMap((d) => d.items)
    .reduce((sum, item) => sum + (item.costJpy ?? 0), 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <RoveLogo size="sm" />
        <Badge tone="outline">แพลนที่แชร์มา</Badge>
      </div>

      <div className="rounded-brand bg-sky/25 mt-4 overflow-hidden">
        <Image
          src={trip.cover}
          alt=""
          width={1200}
          height={800}
          priority
          className="h-40 w-full object-cover sm:h-52"
        />
      </div>

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
        <p className="text-espresso text-sm font-semibold">อยากได้แพลนแบบนี้ของตัวเองไหม</p>
        <p className="text-muted mt-1 text-xs">
          สร้างห้องทริป ชวนเพื่อน หาวันที่ทุกคนว่าง แล้วให้ AI ร่างให้
        </p>
        <ButtonLink href="/new" className="mt-3" size="sm">
          เริ่มทริปของฉัน
        </ButtonLink>
      </Card>
    </main>
  );
}
