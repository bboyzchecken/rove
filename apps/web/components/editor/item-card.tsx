'use client';

import { forwardRef } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Coffee,
  GripVertical,
  MapPin,
  Plane,
  ShoppingBag,
  StickyNote,
  Train,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatDuration, formatMoney, formatTimeRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Issue, Item, ItemType, POIBrief } from '@/types/api';

/**
 * W5.1 — one item on the timeline.
 *
 * Everything a group argues about is on the face of the card: when, where, how
 * long the hop before it takes, what it costs, whether the cost is a guess, and
 * whether the place is one we actually have data for.
 */

const TYPE_ICONS: Record<ItemType, typeof MapPin> = {
  place: MapPin,
  food: Coffee,
  stay: BedDouble,
  transport: Train,
  flight: Plane,
  free: ShoppingBag,
  note: StickyNote,
};

const TYPE_TONES: Record<ItemType, string> = {
  place: 'bg-sky/30',
  food: 'bg-sun/35',
  stay: 'bg-joyfull/30',
  transport: 'bg-espresso/6',
  flight: 'bg-espresso/8',
  free: 'bg-matcha/25',
  note: 'bg-espresso/4',
};

export interface ItemCardProps {
  item: Item;
  poi?: POIBrief;
  issues?: Issue[];
  onClick?: () => void;
  /** dnd-kit listeners, attached to the grip so a tap on the card still opens it. */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  draggable?: boolean;
}

export const ItemCard = forwardRef<HTMLDivElement, ItemCardProps & { style?: React.CSSProperties }>(
  function ItemCard(
    { item, poi, issues = [], onClick, dragHandleProps, isDragging, draggable, style },
    ref,
  ) {
    const Icon = TYPE_ICONS[item.type] ?? MapPin;
    const hasError = issues.some((i) => i.severity === 'error');

    return (
      <div
        ref={ref}
        style={style}
        id={`item-${item.id}`}
        className={cn(
          'rounded-brand bg-surface shadow-brand transition-shadow',
          isDragging && 'opacity-50 shadow-brand-lg',
          hasError && 'ring-1 ring-danger/40',
        )}
      >
        {/* The travel leg belongs to the hop INTO this item, so it sits above
            the card rather than inside it. */}
        {item.travel_min > 0 ? (
          <p className="px-3 pt-2 text-xs text-muted">
            ↑ {item.travel_mode || 'เดินทาง'} {formatDuration(item.travel_min)}
            {item.travel_note ? ` · ${item.travel_note}` : ''}
          </p>
        ) : null}

        <div className="flex items-start gap-2 p-3">
          {draggable ? (
            <button
              type="button"
              aria-label={`ลากเพื่อย้าย ${item.title}`}
              // touch-none stops the browser scrolling instead of dragging on
              // a phone, which is the whole reason X5.1 exists.
              className="mt-0.5 shrink-0 touch-none rounded p-1 text-muted/50 hover:text-muted"
              {...dragHandleProps}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null}

          <span
            className={cn(
              'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-brand',
              TYPE_TONES[item.type],
            )}
          >
            <Icon className="h-4 w-4 text-espresso" />
          </span>

          <button
            type="button"
            onClick={onClick}
            className="min-w-0 flex-1 text-left"
            disabled={!onClick}
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              {item.start_time ? (
                <span className="font-mono text-xs text-muted">
                  {formatTimeRange(item.start_time, item.end_time)}
                </span>
              ) : null}
              <span className="font-medium text-espresso">{item.title}</span>
            </div>

            {item.notes ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.notes}</p>
            ) : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {poi?.area ? <Badge tone="neutral">{poi.area}</Badge> : null}

              {item.duration_min > 0 ? (
                <span className="text-xs text-muted">อยู่ราว {formatDuration(item.duration_min)}</span>
              ) : null}

              {item.cost_amount ? (
                <span className="text-xs font-medium text-espresso">
                  {item.cost_status === 'estimate' ? 'ประมาณ ' : ''}
                  {formatMoney(item.cost_amount, item.cost_currency)}
                  {item.cost_basis === 'per_person' ? '/คน' : ''}
                  {item.cost_basis === 'per_night' ? '/คืน' : ''}
                </span>
              ) : null}

              {item.is_prepaid ? <Badge tone="success">จ่ายแล้ว</Badge> : null}
              {item.booking_status === 'booked' ? <Badge tone="success">จองแล้ว</Badge> : null}
              {item.booking_status === 'clicked' ? <Badge tone="info">กดดูแล้ว</Badge> : null}

              {/* An unverified place is one the AI proposed that is not in our
                  catalogue — its hours and price were never checked. */}
              {item.verified === 'unverified' && item.type !== 'note' && item.type !== 'free' ? (
                <Badge tone="warning">ยังไม่ยืนยัน</Badge>
              ) : null}
            </div>

            {issues.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {issues.map((issue, i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-start gap-1.5 text-xs',
                      issue.severity === 'error' ? 'text-danger' : 'text-muted',
                    )}
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </button>
        </div>
      </div>
    );
  },
);
