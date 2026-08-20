'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  Copy,
  Globe,
  Lightbulb,
  MapPin,
  Sparkles,
  Ticket,
  ThumbsUp,
  Wallet,
} from 'lucide-react';

import { SectionHeader, Stat } from '@/components/common/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterStack } from '@/components/ui/character-avatar';
import { useSetVisibility, useTripRecap } from '@/features/trip/queries';
import { track } from '@/lib/analytics';
import type { RecapDecisionKind } from '@/lib/data';
import { formatMoney } from '@/lib/format';

/**
 * บันทึกทริป — a finished trip, read-only (M17 — W17.5, W17.6).
 *
 * The room a group plans in is built for changing things. Once the trip is
 * over, nobody wants to change anything: they want to know what was decided and
 * why, usually months later and usually because they are planning the next one.
 * So this screen leads with the decisions, keeps the itinerary underneath as
 * the record of what actually happened, and never offers an edit.
 *
 * It is also the only sensible place to offer publishing (§6.5): a trip you
 * have already been on is the only kind worth anyone else copying, and the
 * points it earns are the discount on the next trip.
 */
const DECISION_ICON: Record<RecapDecisionKind, typeof CalendarCheck> = {
  dates: CalendarCheck,
  destination: MapPin,
  budget: Wallet,
  plan: Sparkles,
  rationale: Lightbulb,
  booking: Ticket,
  vote: ThumbsUp,
};

const SPEND_ACCENT = ['bg-primary', 'bg-matcha', 'bg-sky', 'bg-sun', 'bg-joyfull'] as const;

export function TripRecapScreen({ tripId }: { tripId: string }) {
  const { data: recap, isLoading } = useTripRecap(tripId);
  const setVisibility = useSetVisibility(tripId);
  const [copied, setCopied] = useState(false);

  const decisionCount = recap?.decisions.length ?? 0;
  const loaded = Boolean(recap);

  useEffect(() => {
    if (!loaded) return;
    track('trip_recap_viewed', { has_decisions: decisionCount > 0 });
  }, [loaded, decisionCount]);

  if (isLoading || !recap) {
    return (
      <div className="space-y-3 px-4 py-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-brand bg-surface h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  const isPublic = recap.share.visibility === 'public';
  const publicUrl = recap.share.publicSlug
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/p/${recap.share.publicSlug}`
    : null;
  const spendTotal = recap.spending.reduce((sum, line) => sum + line.amountThb, 0);
  const perPerson =
    recap.members.length > 0 ? Math.round(recap.spentThb / recap.members.length) : recap.spentThb;

  async function copyPublicUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the field below stays selectable.
    }
  }

  return (
    <div className="space-y-7 pb-5">
      {/* ------------------------------------------------------- header */}
      <div className="relative">
        <Image
          src={recap.cover}
          alt=""
          width={1600}
          height={900}
          className="h-44 w-full object-cover"
          priority
        />
        <Link
          href="/trips"
          className="bg-bg/90 text-espresso absolute top-4 left-4 flex size-9 items-center justify-center rounded-full"
          aria-label="กลับไปหน้าทริปของฉัน"
        >
          <ChevronLeft className="size-5" />
        </Link>
      </div>

      <div className="space-y-4 px-4">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">จบทริปแล้ว</Badge>
            {isPublic ? (
              <Badge tone="matcha">
                <Globe className="size-3" /> เปิดสาธารณะ
              </Badge>
            ) : null}
          </div>
          <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
            {recap.title}
          </h1>
          <p className="text-muted mt-1 text-sm">
            {recap.dateLabel}
            {recap.cities.length > 0 ? ` · ${recap.cities.join(' · ')}` : ''}
          </p>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat value={recap.days} label="วัน" />
            <Stat value={recap.places} label="ที่ที่ไป" />
            <Stat value={formatMoney(recap.spentThb, 'THB')} label="ใช้ไปจริง" />
          </div>
          <div className="border-border mt-4 flex items-center justify-between gap-3 border-t pt-3">
            <CharacterStack characterIds={recap.members.map((m) => m.characterId)} size="xs" />
            <span className="text-muted text-[11px]">
              ไปกัน {recap.members.length} คน · ตกคนละ {formatMoney(perPerson, 'THB')}
            </span>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------ publish */}
      <section className="px-4">
        {isPublic ? (
          <Card accent="matcha" className="p-4">
            <p className="font-display text-espresso font-bold">ทริปนี้เปิดสาธารณะอยู่</p>
            <p className="text-muted mt-1 text-xs">
              ทุกครั้งที่มีคนก๊อปแพลนนี้ไปแล้วจองตาม คุณได้แต้มเพิ่ม —
              เอาไปเป็นส่วนลดตอนจองทริปหน้าได้
            </p>
            {publicUrl ? (
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={publicUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="bg-bg text-espresso min-w-0 flex-1 rounded-full px-3 py-2 text-[11px] outline-none"
                />
                <Button size="sm" onClick={() => void copyPublicUrl()}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            ) : null}
            <p className="text-muted mt-2 text-[11px]">
              เปิดดูแล้ว {recap.share.viewCount} ครั้ง · ก๊อปไปใช้ {recap.share.cloneCount} ครั้ง ·
              ค่าใช้จ่ายไม่เคยอยู่ในหน้าสาธารณะ
            </p>
          </Card>
        ) : recap.canPublish ? (
          <Card accent="sun" className="p-4">
            <div className="flex items-start gap-3">
              <span className="bg-bg text-primary flex size-9 shrink-0 items-center justify-center rounded-2xl">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-espresso font-bold">
                  เปิดทริปนี้เป็นสาธารณะ รับ {recap.pointsPerPublish.toLocaleString('th-TH')} แต้ม
                </p>
                <p className="text-muted mt-1 text-xs">
                  ทริปที่ไปมาแล้วคือทริปที่คนอื่นอยากตามรอยที่สุด — พอมีคนก๊อปไปแล้วจองตาม
                  คุณได้แต้มเพิ่มอีก และแต้มใช้เป็นส่วนลดตอนจองทริปของตัวเองได้
                </p>
                <p className="text-muted mt-1 text-[11px]">
                  ค่าใช้จ่ายและยอดหารกันไม่ถูกแชร์ไปด้วย ไม่ว่ากรณีไหน
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  disabled={setVisibility.isPending}
                  onClick={() => setVisibility.mutate('public')}
                >
                  <Globe className="size-4" />
                  {setVisibility.isPending ? 'กำลังเปิด…' : 'เปิดเป็นสาธารณะ'}
                </Button>
              </div>
            </div>
          </Card>
        ) : null}
      </section>

      {/* ---------------------------------------------------- decisions */}
      {recap.decisions.length > 0 ? (
        <section className="px-4">
          <SectionHeader label="สิ่งที่ตัดสินใจกันไว้" />
          <Card className="divide-border divide-y">
            {recap.decisions.map((decision) => {
              const Icon = DECISION_ICON[decision.kind];
              const who = recap.members.find((m) => m.id === decision.decidedBy);
              return (
                <div key={decision.id} className="flex items-start gap-3 p-3.5">
                  <span className="bg-bg text-muted flex size-8 shrink-0 items-center justify-center rounded-2xl">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-espresso text-xs font-bold">{decision.title}</p>
                    <p className="text-espresso/90 mt-0.5 text-sm">{decision.detail}</p>
                    {who ? <p className="text-muted mt-1 text-[11px]">โดย {who.name}</p> : null}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      ) : null}

      {/* ---------------------------------------------------- itinerary */}
      {recap.itinerary.length > 0 ? (
        <section className="px-4">
          <SectionHeader label="แพลนที่เดินจริง" />
          <div className="space-y-3">
            {recap.itinerary.map((day) => (
              <Card key={day.id} className="p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-espresso text-sm font-bold">{day.label}</p>
                  <span className="text-muted text-[11px]">{day.city}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {day.items.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-2.5">
                      <span className="text-muted nums w-10 shrink-0 text-[11px]">
                        {item.start}
                      </span>
                      <span className="text-espresso min-w-0 flex-1 text-sm">{item.title}</span>
                      {item.area ? (
                        <span className="text-muted shrink-0 text-[11px]">{item.area}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------- spending */}
      {recap.spending.length > 0 ? (
        <section className="px-4">
          <SectionHeader label="ใช้เงินไปกับอะไร" />
          <Card className="p-4">
            <ul className="space-y-2.5">
              {recap.spending.map((line, i) => (
                <li key={line.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-espresso text-sm">{line.category}</span>
                    <span className="text-espresso nums text-sm font-semibold">
                      {formatMoney(line.amountThb, 'THB')}
                    </span>
                  </div>
                  <div className="bg-surface mt-1 h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full ${SPEND_ACCENT[i % SPEND_ACCENT.length]}`}
                      style={{
                        width: `${spendTotal > 0 ? Math.round((line.amountThb / spendTotal) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {recap.budgetPerPersonThb > 0 ? (
              <p className="text-muted border-border mt-3 border-t pt-3 text-[11px]">
                ตั้งงบไว้ {formatMoney(recap.budgetPerPersonThb, 'THB')} ต่อคน · ใช้จริง{' '}
                {formatMoney(perPerson, 'THB')} ต่อคน
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      {/* ----------------------------------------------------- activity */}
      {recap.activity.length > 0 ? (
        <section className="px-4">
          <SectionHeader label="ความเคลื่อนไหวในห้อง" />
          <Card className="divide-border divide-y">
            {recap.activity.slice(0, 12).map((event) => {
              const who = recap.members.find((m) => m.id === event.memberId);
              return (
                <p key={event.id} className="text-espresso p-3 text-xs">
                  <span className="font-semibold">{who?.name ?? 'สมาชิก'}</span>{' '}
                  <span className="text-muted">{event.text}</span>
                </p>
              );
            })}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
