'use client';

import { useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Bus,
  Car,
  Footprints,
  GripVertical,
  History,
  Lightbulb,
  Map as MapIcon,
  MessageCircle,
  Plus,
  Printer,
  RefreshCw,
  Ticket,
  TrainFront,
  Undo2,
} from 'lucide-react';

import { AiCreditPanel } from '@/components/editor/ai-credit-panel';
import { AiGenerateDialog } from '@/components/editor/ai-generate-dialog';
import { ItemSheet } from '@/components/editor/item-sheet';
import { RouteMap } from '@/components/editor/route-map';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { Sheet } from '@/components/ui/sheet';
import {
  useMoveItem,
  usePlanDays,
  usePlanVersions,
  useRevalidatePlan,
  useUndoPlan,
} from '@/features/plan/queries';
import { useSaveBooking } from '@/features/prep/queries';
import { env } from '@/lib/env';
import { isMockMode } from '@/lib/data';
import { useTripMembers } from '@/features/trip/queries';
import type { ItemType, Member, PlanItem } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Itinerary editor (M5 — W5.1 timeline, W5.4 drag reorder, W5.5 delete,
 * W5.6 map view) with the AI rationale panel (W4.2) alongside it.
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

export function PlanBoard({ tripId, fxRate }: { tripId: string; fxRate: number }) {
  const { data: days = [], isLoading } = usePlanDays(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const moveItem = useMoveItem(tripId);
  const revalidate = useRevalidatePlan(tripId);
  const undo = useUndoPlan(tripId);
  const saveBooking = useSaveBooking(tripId);

  const [dayId, setDayId] = useState<string | null>(null);
  const [view, setView] = useState<'timeline' | 'map'>('timeline');
  const [generating, setGenerating] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // No effect seeds this: "no day chosen yet" simply means the first one.
  const day = days.find((d) => d.id === dayId) ?? days[0];

  const sensors = useSensors(
    // A short drag threshold keeps a tap on the card from becoming a drag,
    // which matters on a phone where the whole row is the touch target.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const toThb = (jpy: number) => Math.round(jpy * fxRate);
  const dayCostJpy = useMemo(
    () => (day?.items ?? []).reduce((sum, i) => sum + (i.costJpy ?? 0), 0),
    [day],
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!day || !over || active.id === over.id) return;

    const oldIndex = day.items.findIndex((i) => i.id === active.id);
    const newIndex = day.items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    // arrayMove is only used to read the resulting index; the hook applies the
    // optimistic update itself so the cache stays the single source.
    void arrayMove(day.items, oldIndex, newIndex);
    moveItem.mutate({ itemId: String(active.id), toDayId: day.id, toIndex: newIndex });
  }

  if (isLoading) {
    return <div className="rounded-brand bg-surface h-64 animate-pulse" />;
  }

  if (days.length === 0) {
    return (
      <div className="space-y-4">
        <AiCreditPanel tripId={tripId} onStart={() => setGenerating(true)} />
        <EmptyState
          image="/brand/empty/empty-plan.webp"
          title="ยังไม่มีแพลน"
          hint="ให้ทุกคนใส่ที่อยากไปก่อน แล้วกดให้ AI ร่างให้ — ปรับเองทีหลังได้ทุกอย่าง"
        />
        <AiGenerateDialog tripId={tripId} open={generating} onClose={() => setGenerating(false)} />

        <PlanHistorySheet
          tripId={tripId}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AiCreditPanel tripId={tripId} onStart={() => setGenerating(true)} />

      {/* day strip ----------------------------------------------------- */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {days.map((d) => {
          const active = d.id === day?.id;
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

      {day ? (
        <>
          {/* day header ------------------------------------------------ */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-espresso text-lg font-extrabold">
                  {day.label} · {day.city}
                </p>
                <p className="text-muted mt-0.5 text-xs">
                  {day.items.length} รายการ · ประมาณ {formatMoney(toThb(dayCostJpy), 'THB')}/คน
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
                <MapIcon className="size-3.5" /> แผนที่
              </Button>
              <Button size="sm" variant="soft" onClick={() => setShowWhy((v) => !v)}>
                <Lightbulb className="size-3.5" /> ทำไมจัดแบบนี้
              </Button>
              <Button
                size="sm"
                variant="soft"
                onClick={() => revalidate.mutate()}
                disabled={revalidate.isPending}
              >
                <RefreshCw
                  className={cn('size-3.5', revalidate.isPending && 'animate-rove-spin')}
                />{' '}
                ตรวจแพลนอีกรอบ
              </Button>
              <Button
                size="sm"
                variant="soft"
                onClick={() => undo.mutate()}
                disabled={undo.isPending}
                title="ย้อนการแก้ไขล่าสุด"
              >
                <Undo2 className="size-3.5" /> ย้อนกลับ
              </Button>
              <Button size="sm" variant="soft" onClick={() => setHistoryOpen(true)}>
                <History className="size-3.5" /> ประวัติ
              </Button>
              <Button size="sm" variant="soft" onClick={() => openPrintable(tripId)}>
                <Printer className="size-3.5" /> พิมพ์/บันทึก
              </Button>
            </div>
          </Card>

          {/* rationale -------------------------------------------------- */}
          {showWhy ? (
            <Card accent="sun" className="animate-rove-rise p-4">
              <p className="section-label mb-2">เหตุผลที่ ROVE จัดแบบนี้</p>
              <ul className="space-y-2">
                {rationalesFor(day.items, members).map((reason) => (
                  <li key={reason} className="text-espresso flex gap-2 text-xs leading-relaxed">
                    <span className="text-primary">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* body ------------------------------------------------------- */}
          {view === 'map' ? (
            <RouteMap items={day.items} city={day.city} />
          ) : (
            <div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={day.items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {day.items.map((item, i) => (
                    <div key={item.id}>
                      <SortableTimelineCard
                        item={item}
                        members={members}
                        fxRate={fxRate}
                        onEdit={() => setEditing(item)}
                        onBook={() => {
                          // Saving it as an idea first is what makes the
                          // Bookings tab the record of what the group decided,
                          // rather than a list of links nobody followed up on.
                          saveBooking.mutate({
                            kind: item.type === 'stay' ? 'stay' : 'activity',
                            title: item.title,
                            partner: 'Klook',
                            url: 'https://www.klook.com/',
                            status: 'idea',
                          });
                        }}
                      />
                      {item.travel && i < day.items.length - 1 ? <TravelHop item={item} /> : null}
                    </div>
                  ))}
                </SortableContext>
              </DndContext>

              <button
                onClick={() => setAdding(true)}
                className="border-border text-muted hover:bg-surface mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-sm font-semibold"
              >
                <Plus className="size-4" /> เพิ่มรายการในวันนี้
              </button>
            </div>
          )}
        </>
      ) : null}

      <AiGenerateDialog tripId={tripId} open={generating} onClose={() => setGenerating(false)} />

      <PlanHistorySheet tripId={tripId} open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {day ? (
        <ItemSheet
          tripId={tripId}
          days={days}
          dayId={day.id}
          item={editing}
          open={Boolean(editing) || adding}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}

// The printable itinerary is the export endpoint's HTML in a new tab. Mock mode
// has no API to ask, so it falls back to the browser's own print dialog.
function openPrintable(tripId: string) {
  if (isMockMode) {
    window.print();
    return;
  }
  const url = new URL(`/api/v1/trips/${tripId}/export`, env.apiUrl);
  url.searchParams.set('format', 'html');
  window.open(url.toString(), '_blank', 'noopener');
}

const ACTION_LABEL: Record<string, string> = {
  update: 'แก้ไข',
  move: 'ย้าย',
  delete: 'ลบ',
};

/** The undo trail, newest first (W5.7). */
function PlanHistorySheet({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: versions = [], isLoading } = usePlanVersions(tripId, open);
  const undo = useUndoPlan(tripId);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ประวัติการแก้ไข"
      description="ย้อนกลับได้ทีละขั้น เริ่มจากอันล่าสุด"
      footer={
        <Button
          block
          size="lg"
          onClick={() => undo.mutate()}
          disabled={undo.isPending || versions.length === 0}
        >
          <Undo2 className="size-4" /> ย้อนขั้นล่าสุด
        </Button>
      }
    >
      {isLoading ? <div className="rounded-brand bg-surface h-24 animate-pulse" /> : null}

      {!isLoading && versions.length === 0 ? (
        <p className="text-muted text-sm">ยังไม่มีการแก้ไขที่ย้อนกลับได้</p>
      ) : null}

      <ul className="divide-border divide-y">
        {versions.map((version) => (
          <li key={version.id} className="flex items-center gap-2 py-2.5">
            <Badge tone="outline">{ACTION_LABEL[version.action] ?? version.action}</Badge>
            <span className="text-espresso min-w-0 flex-1 truncate text-sm">{version.title}</span>
            <span className="text-muted shrink-0 text-[11px]">
              {new Date(version.createdAt).toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** The "ทำไมถึงมีอันนี้" lines, derived from the day rather than canned text. */
function rationalesFor(items: PlanItem[], members: Member[]) {
  const out: string[] = [];

  const early = items.find((i) => i.start < '09:00');
  if (early) out.push(`เริ่ม ${early.start} ที่ "${early.title}" เพราะช่วงเช้าคนน้อยกว่ามาก`);

  const forWhom = new Map<string, string[]>();
  for (const item of items) {
    for (const memberId of item.forMembers ?? []) {
      forWhom.set(memberId, [...(forWhom.get(memberId) ?? []), item.title]);
    }
  }
  for (const [memberId, titles] of forWhom) {
    const member = members.find((m) => m.id === memberId);
    if (member) out.push(`${titles[0]} มาจากที่อยากไปของ${member.name}`);
  }

  const walk = items.filter((i) => i.travel?.mode === 'walk').length;
  if (walk >= 2) out.push(`${walk} ช่วงในวันนี้เดินถึงกันได้ ไม่ต้องเสียเวลารอรถ`);

  const warned = items.filter((i) => i.warning).length;
  if (warned > 0) out.push(`มี ${warned} จุดที่เวลาอาจไม่พอดี — ทำเครื่องหมายไว้ในไทม์ไลน์แล้ว`);

  return out.length > 0 ? out : ['วันนี้ยังไม่มีเหตุผลอะไรพิเศษ — จัดตามลำดับที่สะดวกที่สุด'];
}

function SortableTimelineCard({
  item,
  members,
  fxRate,
  onEdit,
  onBook,
}: {
  item: PlanItem;
  members: Member[];
  fxRate: number;
  onEdit: () => void;
  onBook: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const meta = TYPE_META[item.type];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex gap-3', isDragging && 'relative z-10 opacity-90')}
    >
      {/* time rail */}
      <div className="w-12 shrink-0 pt-3.5 text-right">
        <span className="text-espresso nums text-xs font-medium">{item.start}</span>
        {item.end ? <span className="text-muted nums block text-[10px]">{item.end}</span> : null}
      </div>

      <div className="relative flex flex-col items-center pt-4">
        <span className={cn('size-3 shrink-0 rounded-full', meta.dot)} />
        <span className="bg-surface mt-1 w-px flex-1" />
      </div>

      <Card className={cn('mb-2 min-w-0 flex-1 p-3.5', isDragging && 'shadow-warm')}>
        <div className="flex items-start gap-2">
          <button onClick={onEdit} className="min-w-0 flex-1 text-left">
            <p className="text-espresso text-sm font-semibold">{item.title}</p>
            {item.area ? <p className="text-muted mt-0.5 text-[11px]">{item.area}</p> : null}
          </button>
          <button
            {...attributes}
            {...listeners}
            aria-label={`ลากเพื่อจัดลำดับ ${item.title}`}
            className="text-muted/50 hover:text-muted -mt-1 -mr-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge>{meta.label}</Badge>
          {item.costJpy ? (
            <Badge tone="primary">
              ¥{item.costJpy.toLocaleString('en-US')} ·{' '}
              {formatMoney(Math.round(item.costJpy * fxRate), 'THB')}
            </Badge>
          ) : null}
          {item.openHours ? <Badge tone="sky">เปิด {item.openHours}</Badge> : null}
          {item.booked ? (
            <Badge tone="matcha">
              <Ticket className="size-3" /> จองแล้ว
            </Badge>
          ) : item.bookable ? (
            <button
              onClick={onBook}
              className="bg-espresso text-bg inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            >
              <Ticket className="size-3" /> หาที่จอง
            </button>
          ) : null}
          <button
            onClick={onEdit}
            className="text-muted hover:text-espresso inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px]"
            aria-label={`คุยกันเรื่อง ${item.title}`}
          >
            <MessageCircle className="size-3" /> คุยกัน
          </button>
        </div>

        {item.forMembers?.length ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-muted text-[11px]">มาจากที่อยากไปของ</span>
            {item.forMembers.map((id) => (
              <CharacterAvatar
                key={id}
                characterId={members.find((m) => m.id === id)?.characterId ?? 'shiba'}
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
