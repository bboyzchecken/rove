'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Bus,
  Car,
  Footprints,
  GripVertical,
  Lightbulb,
  Map,
  Plus,
  Sparkles,
  Ticket,
  TrainFront,
} from 'lucide-react';

import { RouteMap } from '@/components/editor/route-map';
import { AiGenerateDialog } from '@/components/editor/ai-generate-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { formatMoney } from '@/lib/format';
import {
  AI_CREDITS,
  CURRENT_USER,
  DAYS,
  jpyToThb,
  MEMBERS,
  RATIONALES,
  type ItemType,
  type PlanItem,
} from '@/lib/mock';
import { cn } from '@/lib/utils';

/**
 * Itinerary editor (M5 — W5.1 timeline, W5.6 list view) with the AI rationale
 * panel (W4.2) alongside it.
 *
 * Drag handles are drawn but inert: dnd-kit reordering is W5.4, and a
 * prototype that pretends to persist a reorder would be lying.
 */
const TYPE_META: Record<ItemType, { dot: string; label: string }> = {
  poi: { dot: 'bg-primary', label: 'สถานที่' },
  meal: { dot: 'bg-sun', label: 'มื้ออาหาร' },
  transport: { dot: 'bg-sky', label: 'เดินทาง' },
  stay: { dot: 'bg-joyfull', label: 'ที่พัก' },
  free: { dot: 'bg-matcha', label: 'เวลาว่าง' },
  flight: { dot: 'bg-espresso', label: 'เที่ยวบิน' },
};

const TRAVEL_ICON = { train: TrainFront, walk: Footprints, bus: Bus, car: Car };

export function PlanBoard() {
  const [dayId, setDayId] = useState(DAYS[0]!.id);
  const [view, setView] = useState<'timeline' | 'map'>('timeline');
  const [generating, setGenerating] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  // Metered AI (§16): held here so a second draft in the same session hits the
  // paywall, which is what the demo needs to show.
  const [runsUsed, setRunsUsed] = useState(AI_CREDITS.used);
  const [points, setPoints] = useState(CURRENT_USER.points);

  const freeLeft = Math.max(0, AI_CREDITS.freePerTrip - runsUsed);

  const day = DAYS.find((d) => d.id === dayId)!;
  const dayCostJpy = day.items.reduce((sum, i) => sum + (i.costJpy ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* day strip ----------------------------------------------------- */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {DAYS.map((d) => {
          const active = d.id === dayId;
          return (
            <button
              key={d.id}
              onClick={() => setDayId(d.id)}
              className={cn(
                'shrink-0 rounded-2xl px-3.5 py-2 text-left transition',
                active ? 'bg-espresso text-bg' : 'bg-surface text-muted',
              )}
            >
              <span className="font-display block text-sm font-bold">วัน {d.index}</span>
              <span className={cn('block text-[10px]', active ? 'text-bg/70' : 'text-muted')}>
                {d.city}
              </span>
            </button>
          );
        })}
      </div>

      {/* day header ---------------------------------------------------- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-espresso text-lg font-extrabold">
              {day.label} · {day.city}
            </p>
            <p className="text-muted mt-0.5 text-xs">
              {day.items.length} รายการ · ประมาณ {formatMoney(jpyToThb(dayCostJpy), 'THB')}/คน
            </p>
          </div>
          {day.weather ? (
            <div className="bg-sky/25 flex items-center gap-2 rounded-full px-3 py-1.5">
              <span>{day.weather.icon}</span>
              <span className="text-espresso text-xs font-semibold">
                {day.weather.high}° / {day.weather.low}°
              </span>
              <span className="text-muted text-[11px]">{day.weather.text}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={view === 'timeline' ? 'espresso' : 'soft'}
            onClick={() => setView('timeline')}
          >
            ไทม์ไลน์
          </Button>
          <Button
            size="sm"
            variant={view === 'map' ? 'espresso' : 'soft'}
            onClick={() => setView('map')}
          >
            <Map className="size-3.5" /> แผนที่
          </Button>
          <Button size="sm" variant="soft" onClick={() => setShowWhy((v) => !v)}>
            <Lightbulb className="size-3.5" /> ทำไมจัดแบบนี้
          </Button>
          <Button size="sm" onClick={() => setGenerating(true)}>
            <Sparkles className="size-3.5" /> ให้ AI ร่างใหม่
            <span className="text-primary-fg/75 text-[11px] font-medium">
              {freeLeft > 0 ? `ฟรีอีก ${freeLeft} ครั้ง` : `${AI_CREDITS.pointsPerRun} แต้ม`}
            </span>
          </Button>
        </div>
      </Card>

      {/* rationale ----------------------------------------------------- */}
      {showWhy ? (
        <Card accent="sun" className="animate-rove-rise p-4">
          <p className="section-label mb-2">เหตุผลที่ ROVE จัดแบบนี้</p>
          <ul className="space-y-2">
            {RATIONALES.map((reason) => (
              <li key={reason} className="text-espresso flex gap-2 text-xs leading-relaxed">
                <span className="text-primary">•</span>
                {reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* body ---------------------------------------------------------- */}
      {view === 'map' ? (
        <RouteMap items={day.items} city={day.city} />
      ) : (
        <div>
          {day.items.map((item, i) => (
            <div key={item.id}>
              <TimelineCard item={item} />
              {item.travel && i < day.items.length - 1 ? <TravelHop item={item} /> : null}
            </div>
          ))}

          <button className="border-border text-muted hover:bg-surface mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-sm font-semibold">
            <Plus className="size-4" /> เพิ่มรายการในวันนี้
          </button>
        </div>
      )}

      {generating ? (
        <AiGenerateDialog
          runsUsed={runsUsed}
          points={points}
          onClose={() => setGenerating(false)}
          onSpend={(method) => {
            setRunsUsed((n) => n + 1);
            if (method === 'points') setPoints((p) => p - AI_CREDITS.pointsPerRun);
          }}
        />
      ) : null}
    </div>
  );
}

function TimelineCard({ item }: { item: PlanItem }) {
  const meta = TYPE_META[item.type];

  return (
    <div className="flex gap-3">
      {/* time rail */}
      <div className="w-12 shrink-0 pt-3.5 text-right">
        <span className="text-espresso nums text-xs font-medium">{item.start}</span>
        {item.end ? <span className="text-muted nums block text-[10px]">{item.end}</span> : null}
      </div>

      <div className="relative flex flex-col items-center pt-4">
        <span className={cn('size-3 shrink-0 rounded-full', meta.dot)} />
        <span className="bg-surface mt-1 w-px flex-1" />
      </div>

      <Card className="mb-2 min-w-0 flex-1 p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-espresso text-sm font-semibold">{item.title}</p>
            {item.area ? <p className="text-muted mt-0.5 text-[11px]">{item.area}</p> : null}
          </div>
          <GripVertical className="text-muted/40 size-4 shrink-0" />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge>{meta.label}</Badge>
          {item.costJpy ? (
            <Badge tone="primary">
              ¥{item.costJpy.toLocaleString('en-US')} · {formatMoney(jpyToThb(item.costJpy), 'THB')}
            </Badge>
          ) : null}
          {item.openHours ? <Badge tone="sky">เปิด {item.openHours}</Badge> : null}
          {item.booked ? (
            <Badge tone="matcha">
              <Ticket className="size-3" /> จองแล้ว
            </Badge>
          ) : item.bookable ? (
            <Badge tone="outline">
              <Ticket className="size-3" /> จองได้
            </Badge>
          ) : null}
        </div>

        {item.forMembers?.length ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-muted text-[11px]">มาจากที่อยากไปของ</span>
            {item.forMembers.map((id) => (
              <CharacterAvatar
                key={id}
                characterId={MEMBERS.find((m) => m.id === id)!.characterId}
                size="xs"
              />
            ))}
          </div>
        ) : null}

        {item.note ? (
          <p className="text-muted mt-2 text-[11px] leading-relaxed">{item.note}</p>
        ) : null}

        {item.warning ? (
          <p className="text-warning mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed font-medium">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {item.warning}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function TravelHop({ item }: { item: PlanItem }) {
  if (!item.travel) return null;
  const Icon = TRAVEL_ICON[item.travel.mode];

  return (
    <div className="text-muted mb-2 flex items-center gap-2 pl-[4.4rem] text-[11px]">
      <Icon className="size-3.5" />
      {item.travel.minutes} นาที
      {item.travel.line ? <span className="text-muted/70">· {item.travel.line}</span> : null}
    </div>
  );
}
