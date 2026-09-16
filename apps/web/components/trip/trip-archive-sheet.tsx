'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useArchiveTrip } from '@/features/trip/queries';

/**
 * "เก็บเข้าคลัง" (Feedback #4 — D-31, D-33). Every trip goes to the คลัง
 * before it can be deleted, so this is the only way out of the trip list.
 */
export function TripArchiveSheet({
  tripId,
  title,
  onClose,
}: {
  tripId: string;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const archive = useArchiveTrip();

  async function confirm() {
    try {
      await archive.mutateAsync(tripId);
      router.replace('/home');
    } catch {
      // Shown in the sheet from `archive.error`.
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="เก็บทริปนี้เข้าคลัง?"
      description={title}
      footer={
        <div className="flex flex-col gap-2">
          <Button block size="lg" onClick={() => void confirm()} disabled={archive.isPending}>
            {archive.isPending ? 'กำลังเก็บ…' : 'เก็บเข้าคลัง'}
          </Button>
          <Button block variant="soft" onClick={onClose} disabled={archive.isPending}>
            ยกเลิก
          </Button>
        </div>
      }
    >
      <ul className="text-ink list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
        <li>ทริปจะหายจากหน้าทริปของทุกคนในห้อง</li>
        <li>ลิงก์สาธารณะและลิงก์แชร์ปิดทันที — คนที่คัดลอกไปแล้วยังใช้สำเนาของตัวเองได้</li>
        <li>
          กู้คืนได้ที่ <span className="font-medium">โปรไฟล์ → คลังทริป</span>{' '}
          (กู้คืนแล้วทริปเป็นส่วนตัว ต้องเปิดสาธารณะใหม่เอง)
        </li>
      </ul>
      {archive.error ? (
        <p className="text-danger mt-3 text-xs">{archive.error.message}</p>
      ) : null}
    </Sheet>
  );
}
