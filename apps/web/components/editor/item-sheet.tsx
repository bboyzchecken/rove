'use client';

import { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';

import { ItemComments } from '@/components/collab/item-comments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useAddItem, usePoiSearch, useRemoveItem, useUpdateItem } from '@/features/plan/queries';
import { useMoveItem } from '@/features/plan/queries';
import type { ItemType, PlanDay, PlanItem } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Add / edit one itinerary item (M5 — W5.2 POI search, W5.3 edit sheet,
 * W5.5 delete).
 *
 * Moving an item to another day lives here as a plain select rather than as a
 * drag across day tabs: on a phone the tabs are off-screen while you hold the
 * card, and a drag you cannot see the target of is a guess.
 */
const TYPES: { key: ItemType; label: string }[] = [
  { key: 'poi', label: 'สถานที่' },
  { key: 'meal', label: 'มื้ออาหาร' },
  { key: 'transport', label: 'เดินทาง' },
  { key: 'stay', label: 'ที่พัก' },
  { key: 'free', label: 'เวลาว่าง' },
  { key: 'flight', label: 'เที่ยวบิน' },
];

export function ItemSheet(props: {
  tripId: string;
  days: PlanDay[];
  /** The day a new item lands in. */
  dayId: string;
  /** null = adding a new item. */
  item: PlanItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!props.open) return null;
  // Remounting per item is what resets the fields — copying props into state
  // inside an effect would fight the next render.
  return <ItemForm key={props.item?.id ?? `new-${props.dayId}`} {...props} />;
}

function ItemForm({
  tripId,
  days,
  dayId,
  item,
  open,
  onClose,
}: {
  tripId: string;
  days: PlanDay[];
  dayId: string;
  item: PlanItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const addItem = useAddItem(tripId);
  const updateItem = useUpdateItem(tripId);
  const removeItem = useRemoveItem(tripId);
  const moveItem = useMoveItem(tripId);

  const [title, setTitle] = useState(item?.title ?? '');
  const [type, setType] = useState<ItemType>(item?.type ?? 'poi');
  const [start, setStart] = useState(item?.start ?? '09:00');
  const [end, setEnd] = useState(item?.end ?? '');
  const [area, setArea] = useState(item?.area ?? '');
  const [costJpy, setCostJpy] = useState(item?.costJpy ? String(item.costJpy) : '');
  const [note, setNote] = useState(item?.note ?? '');
  const [targetDay, setTargetDay] = useState(
    item ? (days.find((d) => d.items.some((i) => i.id === item.id))?.id ?? dayId) : dayId,
  );
  const [query, setQuery] = useState('');

  const { data: pois = [] } = usePoiSearch(query);

  async function save() {
    if (!title.trim()) return;

    const patch = {
      title: title.trim(),
      type,
      start,
      end: end || undefined,
      area: area || undefined,
      costJpy: costJpy ? Number(costJpy) : undefined,
      note: note || undefined,
    };

    if (item) {
      await updateItem.mutateAsync({ itemId: item.id, patch });
      const currentDay = days.find((d) => d.items.some((i) => i.id === item.id));
      if (currentDay && currentDay.id !== targetDay) {
        const target = days.find((d) => d.id === targetDay);
        await moveItem.mutateAsync({
          itemId: item.id,
          toDayId: targetDay,
          toIndex: target?.items.length ?? 0,
        });
      }
    } else {
      await addItem.mutateAsync({ ...patch, dayId: targetDay, bookable: false, booked: false });
    }
    onClose();
  }

  async function remove() {
    if (!item) return;
    await removeItem.mutateAsync(item.id);
    onClose();
  }

  const busy = addItem.isPending || updateItem.isPending || moveItem.isPending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? 'แก้รายการ' : 'เพิ่มรายการ'}
      description={item ? item.title : 'ค้นหาสถานที่ หรือพิมพ์เองก็ได้'}
      footer={
        <div className="flex gap-2">
          {item ? (
            <Button variant="outline" onClick={() => void remove()} disabled={removeItem.isPending}>
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button block size="lg" onClick={() => void save()} disabled={busy || !title.trim()}>
            {busy ? 'กำลังบันทึก…' : item ? 'บันทึก' : 'เพิ่มลงแพลน'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {!item ? (
          <div>
            <label className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
              <Search className="size-3" /> ค้นหาสถานที่
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="เช่น teamLab, ตลาด, ศาลเจ้า"
              className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
            {pois.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {pois.slice(0, 5).map((poi) => (
                  <li key={poi.id}>
                    <button
                      onClick={() => {
                        setTitle(poi.name);
                        setArea(poi.area ?? poi.city);
                        if (poi.costJpy) setCostJpy(String(poi.costJpy));
                        setQuery('');
                      }}
                      className="bg-surface hover:bg-border w-full rounded-2xl p-2.5 text-left"
                    >
                      <p className="text-espresso text-sm font-semibold">{poi.name}</p>
                      <p className="text-muted text-[11px]">
                        {poi.city}
                        {poi.area ? ` · ${poi.area}` : ''}
                        {poi.openHours ? ` · เปิด ${poi.openHours}` : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {poi.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <label className="block">
          <span className="text-muted mb-1.5 block text-[11px] font-semibold">ชื่อรายการ</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
          />
        </label>

        <div>
          <span className="text-muted mb-1.5 block text-[11px] font-semibold">ประเภท</span>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((option) => (
              <button
                key={option.key}
                onClick={() => setType(option.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  type === option.key ? 'bg-espresso text-bg' : 'bg-surface text-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-muted mb-1.5 block text-[11px] font-semibold">เริ่ม</span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="bg-surface text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-muted mb-1.5 block text-[11px] font-semibold">จบ (ไม่ใส่ก็ได้)</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="bg-surface text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-muted mb-1.5 block text-[11px] font-semibold">ย่าน</span>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-muted mb-1.5 block text-[11px] font-semibold">ราคา/คน (เยน)</span>
            <input
              type="number"
              min={0}
              value={costJpy}
              onChange={(e) => setCostJpy(e.target.value)}
              className="bg-surface text-espresso nums w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-muted mb-1.5 block text-[11px] font-semibold">อยู่วันไหน</span>
          <select
            value={targetDay}
            onChange={(e) => setTargetDay(e.target.value)}
            className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
          >
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · {d.city}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-muted mb-1.5 block text-[11px] font-semibold">โน้ต</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="bg-surface text-espresso w-full rounded-2xl px-3.5 py-2.5 text-sm outline-none"
          />
        </label>

        {item ? (
          <div className="border-border border-t pt-3.5">
            <ItemComments tripId={tripId} targetType="item" targetId={item.id} />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
