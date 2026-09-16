'use client';

import { useState } from 'react';
import { Archive } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { useArchivedTrips, useDeleteTrip, useRestoreTrip } from '@/features/trip/queries';
import type { ArchivedTrip } from '@/lib/data';
import { formatThaiDate } from '@/lib/format';

/**
 * คลังทริป (Feedback #4 — D-31, D-32).
 *
 * Restore is always offered. Permanent delete only when the trip never
 * produced points or money — otherwise the evidence chain still points at it.
 */
export function TripArchiveSection() {
  const { data: trips = [], isLoading } = useArchivedTrips();
  const restore = useRestoreTrip();
  const [deleting, setDeleting] = useState<ArchivedTrip | null>(null);

  return (
    <section>
      <SectionHeader label="คลังทริป" />

      {isLoading ? (
        <div className="rounded-brand bg-surface h-16 animate-pulse" />
      ) : trips.length === 0 ? (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <Archive className="size-3.5" />
          ยังไม่มีทริปในคลัง
        </p>
      ) : (
        <Card className="divide-border divide-y">
          {trips.map((trip) => {
            const restoring = restore.isPending && restore.variables === trip.id;
            return (
              <div key={trip.id} className="flex items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-medium">{trip.title}</p>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {trip.archivedAt ? `เก็บเมื่อ ${formatThaiDate(trip.archivedAt)}` : 'อยู่ในคลัง'}
                    {trip.cities.length > 0 ? ` · ${trip.cities.join(' · ')}` : ''}
                  </p>
                  {!trip.canDelete ? (
                    <p className="text-muted mt-1 text-[11px] leading-relaxed">
                      ลบถาวรไม่ได้ เพราะทริปนี้เคยทำให้เกิดแต้มหรือรายได้
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={restoring}
                    onClick={() => restore.mutate(trip.id)}
                  >
                    {restoring ? 'กำลังกู้คืน…' : 'กู้คืน'}
                  </Button>
                  {trip.canDelete ? (
                    <button
                      type="button"
                      onClick={() => setDeleting(trip)}
                      className="text-muted hover:text-danger px-2 py-1 text-[11px] font-medium transition"
                    >
                      ลบถาวร
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {restore.error ? <p className="text-danger mt-2 text-xs">{restore.error.message}</p> : null}

      {deleting ? <DeleteTripSheet trip={deleting} onClose={() => setDeleting(null)} /> : null}
    </section>
  );
}

function DeleteTripSheet({ trip, onClose }: { trip: ArchivedTrip; onClose: () => void }) {
  const remove = useDeleteTrip();

  async function confirm() {
    try {
      await remove.mutateAsync(trip.id);
      onClose();
    } catch {
      // Shown under the warning from `remove.error`.
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="ลบทริปนี้ถาวร?"
      description={trip.title}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            block
            size="lg"
            onClick={() => void confirm()}
            disabled={remove.isPending}
          >
            {remove.isPending ? 'กำลังลบ…' : 'ลบถาวร'}
          </Button>
          <Button block variant="soft" onClick={onClose} disabled={remove.isPending}>
            ยกเลิก
          </Button>
        </div>
      }
    >
      <p className="text-ink text-sm leading-relaxed">
        ลบแล้วกู้คืนไม่ได้ — แพลน ที่อยากไป ค่าใช้จ่าย รูป และเอกสารของทริปนี้จะหายไปสำหรับทุกคนในห้อง
      </p>
      {remove.error ? <p className="text-danger mt-3 text-xs">{remove.error.message}</p> : null}
    </Sheet>
  );
}
