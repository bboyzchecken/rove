'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ChevronLeft, CloudOff, MapPin, Navigation, Wallet } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlanDays } from '@/features/plan/queries';
import { useTrip } from '@/features/trip/queries';
import type { PlanDay, PlanItem } from '@/lib/data';
import { readOfflineTrip, saveOfflineTrip } from '@/lib/offline';
import { toIsoDate } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * Trip Mode — /t/[id]/now (M10 — W10.6).
 *
 * Every other screen in this app is for deciding. This one is for a person
 * standing on a platform in Ueno at 09:14 who needs to know where they are
 * going next and how to get there. So it answers exactly three questions —
 * what now, what next, how do I get there — and it keeps answering them with
 * no signal, from the copy of the day it saved the last time it loaded.
 */
export function TripNowScreen({ tripId }: { tripId: string }) {
  const { data: trip } = useTrip(tripId);
  const { data: days } = usePlanDays(tripId);

  // Everything below depends on the clock and on localStorage, neither of
  // which the server has. Rendering it before hydration would guarantee a
  // mismatch, so the first paint is deliberately the skeleton.
  const hydrated = useHydrated();
  const now = useNow();
  const offline = useOffline();
  const cached = hydrated ? readOfflineTrip(tripId) : null;

  // Keep the copy fresh whenever the real thing arrives.
  useEffect(() => {
    if (!trip || !days?.length) return;
    saveOfflineTrip(
      tripId,
      {
        id: trip.id,
        title: trip.title,
        startDate: trip.startDate,
        endDate: trip.endDate,
        cities: trip.cities,
      },
      days,
    );
  }, [tripId, trip, days]);

  const frame = trip ?? cached?.trip;
  const plan = days?.length ? days : (cached?.days ?? []);

  if (!hydrated || !frame) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-muted text-sm">กำลังโหลดทริป…</p>
      </main>
    );
  }

  const today = toIsoDate(now);
  const current = pickDay(plan, today);
  const upcoming = current ? splitDay(current, now) : null;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pt-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/t/${tripId}` as never}
          className="text-muted hover:text-ink flex items-center gap-1 text-sm transition"
        >
          <ChevronLeft className="size-4" />
          ห้องทริป
        </Link>
        <Badge tone="outline">โหมดวันเดินทาง</Badge>
      </div>

      <h1 className="font-display text-ink mt-3 text-xl font-medium tracking-tight">
        {frame.title}
      </h1>

      {offline ? (
        <p className="text-muted mt-1 flex items-center gap-1.5 text-[11px]">
          <CloudOff className="size-3.5" />
          ออฟไลน์อยู่ — ใช้ข้อมูลที่บันทึกไว้
          {cached ? ` เมื่อ ${savedLabel(cached.savedAt)}` : ''}
        </p>
      ) : null}

      {!current ? (
        <BeforeOrAfter tripId={tripId} today={today} frame={frame} plan={plan} />
      ) : (
        <>
          <p className="text-muted mt-0.5 text-sm">
            {current.label} · {current.city}
          </p>

          {upcoming?.now ? (
            <NowCard item={upcoming.now} label="ตอนนี้" accent="feature" />
          ) : null}
          {upcoming?.next ? (
            <NowCard item={upcoming.next} label="ต่อไป" accent="gray" />
          ) : null}

          {upcoming && upcoming.rest.length > 0 ? (
            <section className="mt-5">
              <p className="text-muted mb-1.5 text-xs font-medium">ที่เหลือของวันนี้</p>
              <Card className="divide-border divide-y">
                {upcoming.rest.map((item) => (
                  <RestLine key={item.id} item={item} city={current.city} />
                ))}
              </Card>
            </section>
          ) : null}

          {!upcoming?.now && !upcoming?.next && upcoming?.rest.length === 0 ? (
            <Card className="mt-4 p-5 text-center">
              <p className="text-ink text-sm font-medium">วันนี้จบแล้ว</p>
              <p className="text-muted mt-1 text-xs">พักผ่อนก่อน แล้วพรุ่งนี้ค่อยว่ากัน</p>
            </Card>
          ) : null}
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <ButtonLink href={`/t/${tripId}/expense` as never} size="sm" variant="soft">
          <Wallet className="size-3.5" />
          บันทึกค่าใช้จ่าย
        </ButtonLink>
        <ButtonLink href={`/t/${tripId}/plan` as never} size="sm" variant="soft">
          ดูแพลนทั้งหมด
        </ButtonLink>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ parts -- */

function NowCard({
  item,
  label,
  accent,
}: {
  item: PlanItem;
  label: string;
  accent: 'feature' | 'gray';
}) {
  return (
    <Card accent={accent} className="mt-4 p-4">
      <p className="text-muted text-xs font-medium">{label}</p>
      <p className="font-display text-ink mt-1 text-lg font-medium">{item.title}</p>
      <p className="text-muted nums mt-0.5 text-sm">
        {item.start}
        {item.end ? `–${item.end}` : ''}
        {item.area ? ` · ${item.area}` : ''}
      </p>
      {item.warning ? <p className="text-warning mt-2 text-xs">{item.warning}</p> : null}
      <NavigateLink item={item} className="mt-3" />
    </Card>
  );
}

function RestLine({ item, city }: { item: PlanItem; city: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <span className="text-ink nums w-12 shrink-0 text-xs font-medium">{item.start}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-medium">{item.title}</p>
        {item.area ? <p className="text-muted truncate text-[11px]">{item.area}</p> : null}
      </div>
      <NavigateLink item={item} city={city} compact />
    </div>
  );
}

/**
 * Hands the stop to Google Maps rather than drawing a map here.
 *
 * Turn-by-turn navigation is a product, not a feature, and the phone already
 * has one that knows about the Yamanote line. The destination is the place
 * name plus its area — searching that beats a lat/lng the plan does not carry.
 */
function NavigateLink({
  item,
  city,
  compact = false,
  className,
}: {
  item: PlanItem;
  city?: string;
  compact?: boolean;
  className?: string;
}) {
  const destination = [item.title, item.area, city].filter(Boolean).join(' ');
  const href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`นำทางไป ${item.title}`}
        className="text-muted hover:text-ink hover:bg-surface shrink-0 rounded-full p-2 transition"
      >
        <Navigation className="size-4" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'bg-ink text-bg inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition hover:opacity-90',
        className,
      )}
    >
      <Navigation className="size-3.5" />
      นำทางไปที่นี่
    </a>
  );
}

function BeforeOrAfter({
  tripId,
  today,
  frame,
  plan,
}: {
  tripId: string;
  today: string;
  frame: { startDate: string; endDate: string; cities: string[] };
  plan: PlanDay[];
}) {
  if (frame.startDate && today < frame.startDate) {
    const days = Math.max(
      1,
      Math.round(
        (new Date(frame.startDate).getTime() - new Date(today).getTime()) / 86_400_000,
      ),
    );
    const first = plan[0];

    return (
      <Card className="mt-4 p-5">
        <p className="text-ink text-sm font-medium">อีก {days} วันก็ได้ไปแล้ว</p>
        <p className="text-muted mt-1 text-xs">
          โหมดนี้จะเริ่มทำงานเองในวันแรกของทริป — เปิดค้างไว้ได้เลย
        </p>
        {first ? (
          <div className="border-border mt-3 border-t pt-3">
            <p className="text-muted flex items-center gap-1.5 text-[11px]">
              <MapPin className="size-3" />
              วันแรก · {first.city}
            </p>
            <ul className="mt-1.5 space-y-1">
              {first.items.slice(0, 3).map((item) => (
                <li key={item.id} className="text-ink nums text-xs">
                  {item.start} {item.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="mt-4 p-5 text-center">
      <p className="text-ink text-sm font-medium">ทริปนี้จบแล้ว</p>
      <p className="text-muted mt-1 text-xs">ไปดูบันทึกทริปกันดีกว่า</p>
      <ButtonLink href={`/recap/${tripId}` as never} size="sm" className="mt-3">
        เปิดบันทึกทริป
      </ButtonLink>
    </Card>
  );
}

/* ------------------------------------------------------------------ logic -- */

function pickDay(days: PlanDay[], today: string) {
  return days.find((day) => day.date === today) ?? null;
}

/**
 * Splits a day at the clock: what is happening, what is next, what is left.
 *
 * "Now" is the last stop whose start time has passed, which is the honest
 * reading when a plan carries start times and rough end times — you are at the
 * temple until you leave for lunch, not until the temple closes.
 */
function splitDay(day: PlanDay, now: Date) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const started = day.items.filter((item) => toMinutes(item.start) <= minutes);
  const ahead = day.items.filter((item) => toMinutes(item.start) > minutes);

  const current = started.length > 0 ? (started[started.length - 1] as PlanItem) : null;
  // A stop that ended before now is history, not "ตอนนี้".
  const stillOn = current && (!current.end || toMinutes(current.end) > minutes) ? current : null;

  return {
    now: stillOn,
    next: (ahead[0] as PlanItem | undefined) ?? null,
    rest: ahead.slice(1),
  };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function savedLabel(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * True only once the browser has taken over.
 *
 * useSyncExternalStore with a subscribe that never fires: the server snapshot
 * is false, the client snapshot is true, and React is told about the switch
 * exactly once, at hydration — which is the whole contract.
 */
const neverChanges = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/** A clock that ticks once a minute — this screen is about "now". */
function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return now;
}

function useOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return offline;
}
