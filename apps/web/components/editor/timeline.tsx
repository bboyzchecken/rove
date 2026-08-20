'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';

import { useMoveItem } from '@/features/plan/queries';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import type { DayDetail, Issue, Item, POIBrief } from '@/types/api';

import { ItemCard } from './item-card';

/**
 * W5.4 — drag and drop, within a day and across days.
 *
 * Sensors are configured for a phone first (X5.1): a touch drag needs a short
 * hold before it starts, or every scroll gesture becomes a drag. The keyboard
 * sensor is not optional — a timeline that can only be reordered by dragging is
 * unusable with a keyboard or a screen reader.
 */

export function Timeline({
  tripId,
  planId,
  day,
  pois,
  issues,
  canEdit,
  onEditItem,
  onAddItem,
}: {
  tripId: string;
  planId: string;
  day: DayDetail;
  pois: Record<string, POIBrief>;
  issues: Issue[];
  canEdit: boolean;
  onEditItem: (item: Item) => void;
  onAddItem: () => void;
}) {
  const [dragging, setDragging] = useState<Item | null>(null);
  const moveItem = useMoveItem(tripId, planId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A few pixels of slop so a tap on the card is a tap, not a 1px drag.
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      // Hold-then-drag: without the delay, dragging steals every scroll.
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const issuesByItem = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!issue.item_id) continue;
      map.set(issue.item_id, [...(map.get(issue.item_id) ?? []), issue]);
    }
    return map;
  }, [issues]);

  function handleDragStart(event: DragStartEvent) {
    const item = day.items.find((i) => i.id === event.active.id);
    setDragging(item ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = day.items.findIndex((i) => i.id === active.id);
    const to = day.items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;

    moveItem.mutate({ itemId: String(active.id), dayId: day.id, position: to });
  }

  if (day.items.length === 0) {
    return (
      <EmptyState
        title="วันนี้ยังว่างอยู่"
        description={canEdit ? 'เพิ่มที่แรกของวันนี้ได้เลย' : undefined}
        action={
          canEdit ? (
            <Button size="sm" onClick={onAddItem}>
              <Plus className="h-4 w-4" />
              เพิ่มรายการ
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <SortableContext
        items={day.items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-2">
          {day.items.map((item) => (
            <li key={item.id}>
              <SortableItem
                item={item}
                poi={item.poi_id ? pois[item.poi_id] : undefined}
                issues={issuesByItem.get(item.id) ?? []}
                canEdit={canEdit}
                onClick={() => onEditItem(item)}
              />
            </li>
          ))}
        </ul>
      </SortableContext>

      {/* The overlay is what the finger carries; without it the card would jump
          to its new slot before the drop lands. */}
      <DragOverlay>
        {dragging ? (
          <ItemCard
            item={dragging}
            poi={dragging.poi_id ? pois[dragging.poi_id] : undefined}
            draggable
          />
        ) : null}
      </DragOverlay>

      {canEdit ? (
        <Button variant="ghost" size="sm" full className="mt-2" onClick={onAddItem}>
          <Plus className="h-4 w-4" />
          เพิ่มรายการ
        </Button>
      ) : null}
    </DndContext>
  );
}

function SortableItem({
  item,
  poi,
  issues,
  canEdit,
  onClick,
}: {
  item: Item;
  poi?: POIBrief;
  issues: Issue[];
  canEdit: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  return (
    <ItemCard
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      item={item}
      poi={poi}
      issues={issues}
      isDragging={isDragging}
      draggable={canEdit}
      dragHandleProps={canEdit ? { ...attributes, ...listeners } : undefined}
      onClick={onClick}
    />
  );
}
