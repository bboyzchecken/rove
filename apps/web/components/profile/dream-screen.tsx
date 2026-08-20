'use client';

import { DreamList } from '@/components/profile/dream-list';
import { Card } from '@/components/ui/card';
import { useDreams } from '@/features/auth/queries';

/**
 * "ที่อยากไปสักวัน" as a destination of its own (M15).
 *
 * It used to be a section inside the profile, which buried the one surface a
 * user touches between trips — the list they add to whenever they see
 * something on a feed.
 */
export function DreamScreen() {
  const { data: dreams = [] } = useDreams();

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight">
          ที่อยากไปสักวัน
        </h1>
        <p className="text-muted mt-1 text-sm">
          {dreams.length > 0
            ? `เก็บไว้แล้ว ${dreams.length} อย่าง — กดอันไหนก็เริ่มเป็นทริปได้เลย`
            : 'เจออะไรน่าไปตอนเลื่อนฟีด เก็บไว้ตรงนี้ก่อน'}
        </p>
      </div>

      <DreamList />

      <Card accent="sky" className="p-4">
        <p className="text-espresso text-xs leading-relaxed">
          รายการนี้เป็นของคุณคนเดียว เพื่อนในทริปไม่เห็น — ต่างจาก
          &ldquo;ที่อยากไป&rdquo; ในห้องทริป ที่ทุกคนเห็นและ AI เอาไปใช้ร่างแพลน
        </p>
      </Card>
    </div>
  );
}
