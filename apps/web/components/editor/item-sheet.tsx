'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Search, Trash2, Undo2 } from 'lucide-react';

import { useBookingLink, useBookingStatus } from '@/features/booking/queries';
import { useDeleteItem, useUpdateItem, type ItemInput } from '@/features/plan/queries';
import { usePOISearch, useResolvePOI } from '@/features/poi/queries';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import type { Item, ItemType, POIBrief } from '@/types/api';

/**
 * W5.3 — the edit sheet, covering every field in §4.2 that a person can
 * reasonably set. It doubles as the booking surface (W12.1), because the moment
 * someone is looking at a hotel's cost is the moment they want to book it.
 */

const TYPE_LABELS: Record<ItemType, string> = {
  place: 'สถานที่',
  food: 'ร้านอาหาร',
  stay: 'ที่พัก',
  transport: 'การเดินทาง',
  flight: 'เที่ยวบิน',
  free: 'เวลาว่าง',
  note: 'โน้ต',
};

interface ItemSheetProps {
  tripId: string;
  planId: string;
  item: Item | null;
  poi?: POIBrief;
  canEdit: boolean;
  onClose: () => void;
  /** Reports the deleted id so the caller can offer undo (W5.5). */
  onDeleted?: (itemId: string) => void;
}

/**
 * The form state is seeded from the item, so the item is a `key` rather than
 * something an effect copies into state — opening a different card remounts the
 * form instead of syncing it, which is both simpler and impossible to get out
 * of step.
 */
export function ItemSheet(props: ItemSheetProps) {
  if (!props.item) return null;
  return <ItemSheetForm key={props.item.id} {...props} item={props.item} />;
}

function initialForm(item: Item): ItemInput {
  return {
    title: item.title,
    type: item.type,
    notes: item.notes,
    start_time: item.start_time,
    end_time: item.end_time,
    duration_min: item.duration_min,
    travel_mode: item.travel_mode,
    travel_min: item.travel_min,
    travel_note: item.travel_note,
    cost_amount: item.cost_amount,
    cost_currency: item.cost_currency,
    cost_basis: item.cost_basis,
    cost_status: item.cost_status,
    cost_note: item.cost_note,
    is_prepaid: item.is_prepaid,
    poi_id: item.poi_id ?? undefined,
  };
}

function ItemSheetForm({
  tripId,
  planId,
  item,
  poi,
  canEdit,
  onClose,
  onDeleted,
}: ItemSheetProps & { item: Item }) {
  const [form, setForm] = useState<ItemInput>(() => initialForm(item));
  const [poiQuery, setPOIQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const updateItem = useUpdateItem(tripId, planId);
  const deleteItem = useDeleteItem(tripId, planId);
  const bookingLink = useBookingLink(tripId, planId);
  const bookingStatus = useBookingStatus(tripId, planId);
  const { data: poiResults } = usePOISearch(poiQuery);
  const resolvePOI = useResolvePOI();

  function save() {
    updateItem.mutate({ itemId: item.id, ...form }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={canEdit ? 'แก้รายการ' : item.title}
      size="lg"
      footer={
        canEdit ? (
          <>
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              loading={deleteItem.isPending}
              onClick={() =>
                deleteItem.mutate(item.id, {
                  onSuccess: () => {
                    onDeleted?.(item.id);
                    onClose();
                  },
                })
              }
            >
              <Trash2 className="h-4 w-4" />
              ลบ
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button loading={updateItem.isPending} onClick={save}>
              บันทึก
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>ปิด</Button>
        )
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อรายการ">
          <Input
            value={form.title}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ประเภท">
            <Select
              value={form.type ?? 'place'}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })}
            >
              {(Object.keys(TYPE_LABELS) as ItemType[]).map((key) => (
                <option key={key} value={key}>
                  {TYPE_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="สถานที่ในระบบ" hint={poi ? poi.name : 'ยังไม่ผูกกับสถานที่'}>
            <Button
              variant="outline"
              full
              disabled={!canEdit}
              onClick={() => setShowSearch((s) => !s)}
            >
              <Search className="h-4 w-4" />
              {poi ? 'เปลี่ยน' : 'ค้นหา'}
            </Button>
          </Field>
        </div>

        {showSearch ? (
          <div className="space-y-2 rounded-brand bg-espresso/4 p-3">
            <Input
              autoFocus
              value={poiQuery}
              onChange={(e) => setPOIQuery(e.target.value)}
              placeholder="พิมพ์ชื่อสถานที่ หรือวางลิงก์ Google Maps"
            />

            {poiQuery.startsWith('http') ? (
              <Button
                size="sm"
                full
                loading={resolvePOI.isPending}
                onClick={async () => {
                  const result = await resolvePOI.mutateAsync({ google_maps_url: poiQuery });
                  setForm({ ...form, poi_id: result.poi.id, title: form.title || result.poi.name_th });
                  setShowSearch(false);
                }}
              >
                ใช้ลิงก์นี้
              </Button>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {poiResults?.items.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          ...form,
                          poi_id: result.id,
                          title: result.name_th || result.name_en,
                        });
                        setShowSearch(false);
                      }}
                      className="w-full rounded-brand px-2 py-1.5 text-left text-sm hover:bg-surface"
                    >
                      <span className="font-medium text-espresso">
                        {result.name_th || result.name_en}
                      </span>
                      {result.area ? (
                        <span className="ml-1.5 text-xs text-muted">{result.area}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {resolvePOI.error ? (
              <p className="text-xs text-danger">{(resolvePOI.error as Error).message}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Field label="เริ่ม">
            <Input
              type="time"
              value={form.start_time ?? ''}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </Field>
          <Field label="จบ">
            <Input
              type="time"
              value={form.end_time ?? ''}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </Field>
          <Field label="อยู่กี่นาที">
            <Input
              type="number"
              min={0}
              value={form.duration_min ?? 0}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="เดินทางมายังไง">
            <Select
              value={form.travel_mode ?? ''}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, travel_mode: e.target.value })}
            >
              <option value="">—</option>
              <option value="train">รถไฟ</option>
              <option value="walk">เดิน</option>
              <option value="bus">รถบัส</option>
              <option value="car">รถยนต์</option>
              <option value="taxi">แท็กซี่</option>
            </Select>
          </Field>
          <Field label="ใช้เวลาเดินทาง (นาที)">
            <Input
              type="number"
              min={0}
              value={form.travel_min ?? 0}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, travel_min: Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="ราคา">
            <Input
              type="number"
              min={0}
              value={form.cost_amount ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                setForm({
                  ...form,
                  cost_amount: e.target.value ? Number(e.target.value) : null,
                  // A price a person typed is not an AI estimate any more.
                  cost_status: 'quoted',
                })
              }
            />
          </Field>
          <Field label="สกุลเงิน">
            <Select
              value={form.cost_currency ?? 'JPY'}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, cost_currency: e.target.value })}
            >
              <option value="JPY">JPY</option>
              <option value="THB">THB</option>
            </Select>
          </Field>
          <Field label="คิดยังไง">
            <Select
              value={form.cost_basis ?? 'per_person'}
              disabled={!canEdit}
              onChange={(e) =>
                setForm({ ...form, cost_basis: e.target.value as Item['cost_basis'] })
              }
            >
              <option value="per_person">ต่อคน</option>
              <option value="per_group">ต่อกลุ่ม</option>
              <option value="per_night">ต่อคืน</option>
              <option value="per_unit">ต่อชิ้น</option>
            </Select>
          </Field>
        </div>

        {form.cost_amount ? (
          <label className="flex items-center gap-2.5 text-sm text-espresso">
            <input
              type="checkbox"
              checked={form.is_prepaid ?? false}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, is_prepaid: e.target.checked })}
              className="h-4 w-4 rounded accent-[hsl(var(--brand-primary))]"
            />
            จ่ายไปแล้ว (แยกออกจากยอดที่ยังต้องจ่าย)
          </label>
        ) : null}

        <Field label="โน้ต">
          <Textarea
            value={form.notes ?? ''}
            rows={3}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        {canEdit && (item.type === 'stay' || item.type === 'place' || item.type === 'transport') ? (
          <div className="rounded-brand bg-matcha/20 p-3">
            <p className="mb-2 text-sm font-medium text-espresso">จองที่นี่</p>
            {item.booking_url ? (
              <div className="flex flex-wrap gap-2">
                <a
                  href={item.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-brand bg-espresso px-3 text-sm text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  ไปหน้าจอง ({item.booking_partner})
                </a>
                <Select
                  value={item.booking_status}
                  onChange={(e) =>
                    bookingStatus.mutate({
                      itemId: item.id,
                      status: e.target.value as Item['booking_status'],
                    })
                  }
                  className="h-9 w-auto py-0 text-sm"
                >
                  <option value="none">ยังไม่ได้ทำอะไร</option>
                  <option value="clicked">กดดูแล้ว</option>
                  <option value="booked">จองแล้ว</option>
                  <option value="skipped">ไม่จองแล้ว</option>
                </Select>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={bookingLink.isPending}
                onClick={() => bookingLink.mutate(item.id)}
              >
                หาลิงก์จอง
              </Button>
            )}
            {bookingLink.error ? (
              <p className="mt-2 text-xs text-danger">{(bookingLink.error as Error).message}</p>
            ) : null}
          </div>
        ) : null}

        {updateItem.error ? (
          <p className="text-sm text-danger">{(updateItem.error as Error).message}</p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** W5.5 — the undo affordance that pairs with an optimistic delete. */
export function UndoBanner({
  itemId,
  onUndo,
  onDismiss,
}: {
  itemId: string;
  onUndo: (itemId: string) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    // Undo is a moment, not a mode: after ten seconds the timeline is the
    // truth and a stale banner is just clutter.
    const timer = setTimeout(onDismiss, 10_000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-brand bg-espresso px-4 py-3 text-sm text-white shadow-brand-lg sm:bottom-6">
      <span className="flex-1">ลบรายการแล้ว</span>
      <button
        type="button"
        onClick={() => onUndo(itemId)}
        className="inline-flex items-center gap-1.5 font-medium text-primary-light"
      >
        <Undo2 className="h-4 w-4" />
        เรียกคืน
      </button>
    </div>
  );
}
