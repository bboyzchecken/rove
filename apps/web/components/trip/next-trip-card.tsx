'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CopyPlus, Globe, NotebookPen, Ticket } from 'lucide-react';

import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCloneTrip } from '@/features/trip/queries';
import { track } from '@/lib/analytics';
import { TRIP_PASS_PRICE_THB } from '@/lib/catalog/plans';

/**
 * "เริ่มทริปใหม่จากใบนี้" — the card that stands where a finished trip is about
 * to be recycled into the next one (M26 follow-up).
 *
 * WHY IT EXISTS
 * Trip Pass is priced per trip and stays with that trip forever, so the
 * cheapest way to plan a second holiday is to overwrite the first one: change
 * the dates, change the cities, keep the pass. Nothing stops that and nothing
 * should — ADR 0006 is explicit that a planning fee which blocks planning is
 * the one outcome this price structure exists to avoid, and the pricing FAQ
 * already promises out loud that the pass "ยังอยู่กับทริปนั้นตลอด". Walking that
 * back inside the room would make the page a lie.
 *
 * So this card does not warn, gate, or count anything. It names the three
 * things an overwrite quietly costs the person doing it — all true, none of
 * them visible from inside the room:
 *
 *   1. The refund fires at most once per trip (ADR 0006). A second trip that
 *      books through ROVE refunds a second ฿299; a trip edited forever refunds
 *      exactly once, ever.
 *   2. บันทึกทริป is the record of what actually happened — spend, photos,
 *      decisions. Editing the frame on top of it is a delete with no dialog.
 *   3. Points come from finished trips: publishing is offered on the recap
 *      screen and nowhere else, so a plan that never stops moving earns none.
 *
 * The button answers the only real objection ("แล้วต้องตั้งใหม่หมดเหรอ").
 * `POST /trips/:id/clone` (A11.1) already copies the frame and the itinerary
 * and leaves the money, the photos and the paperwork behind — which is exactly
 * the split this card is arguing for, so the argument costs one tap.
 */

/** The same three facts in both places: the surface changes the framing, not the offer. */
const BENEFITS = [
  {
    icon: Ticket,
    title: `ได้คืนอีก ฿${TRIP_PASS_PRICE_THB}`,
    body: `Trip Pass คืนหนึ่งครั้งต่อทริป — ทริปใหม่ที่จองผ่าน ROVE ก็ได้คืนเต็ม ฿${TRIP_PASS_PRICE_THB} อีกใบ ส่วนทริปเดิมที่วางทับไปเรื่อย ๆ คืนได้แค่ครั้งเดียวตลอดกาล`,
  },
  {
    icon: NotebookPen,
    title: 'บันทึกทริปใบนี้ไม่โดนทับ',
    body: 'ค่าใช้จ่ายจริง รูป และสิ่งที่ตัดสินใจกันไว้ อยู่ครบในใบเก่า — แก้วันกับปลายทางทับลงไปคือลบมันทิ้งโดยไม่มีใครถาม',
  },
  {
    icon: Globe,
    title: 'แพลนที่จบแล้วทำแต้มให้คุณ',
    body: 'ทริปที่ไปมาแล้วเปิดเป็นสาธารณะได้ มีคนก๊อปไปแล้วจองตามเมื่อไหร่ก็ได้แต้ม เอาไปเป็นส่วนลดทริปหน้า ทริปที่ยังไม่จบทำแบบนี้ไม่ได้',
  },
] as const;

/**
 * The accent is per surface, and it is not decoration.
 *
 * In the room this card lands directly above the onboarding checklist, which
 * is already `feature` — two feature cards stacked read as one block of colour
 * split by a gap, and the nudge loses the separateness the whole argument
 * depends on. Gray is §2.1's "subtle block" and is the right register anyway:
 * the card is an offer, not a warning, and the black button inside carries all
 * the pull it needs.
 *
 * On บันทึกทริป nothing sits near it — the publish card is a screenful above —
 * so it takes the room's colour and closes the page in it.
 */
const COPY = {
  room: {
    accent: 'gray',
    title: 'ทริปนี้จบไปแล้ว — กำลังวางทริปหน้าอยู่หรือเปล่า',
    lead: 'แก้ใบนี้ต่อก็ได้ ไม่มีใครมาปิด Trip Pass อยู่กับทริปนี้ตลอด แต่ถ้านี่คือทริปใหม่ การเปิดใบใหม่ให้มากกว่า',
    cta: 'ก๊อปเป็นทริปใหม่',
  },
  recap: {
    accent: 'feature',
    title: 'ทริปหน้าเริ่มจากใบนี้ได้เลย',
    lead: 'แพลนที่เดินมาแล้วจริงคือจุดตั้งต้นที่ดีที่สุดของทริปถัดไป ก๊อปโครงเดิมไปได้ทั้งใบ แล้วใบนี้ยังอยู่ที่เดิม',
    cta: 'เริ่มทริปใหม่จากแพลนนี้',
  },
} as const;

export function NextTripCard({
  tripId,
  surface,
}: {
  tripId: string;
  /** Where it is standing — the room a finished trip is still being edited in, or บันทึกทริป. */
  surface: 'room' | 'recap';
}) {
  const router = useRouter();
  const clone = useCloneTrip();
  const copy = COPY[surface];

  useEffect(() => {
    track('next_trip_nudge_shown', { surface });
  }, [surface]);

  function startNextTrip() {
    clone.mutate(tripId, {
      onSuccess: (copied) => {
        track('next_trip_started', { surface });
        router.push(`/t/${copied.id}` as never);
      },
    });
  }

  return (
    <Card accent={copy.accent} className="p-4 sm:p-5">
      <p className="font-display text-ink font-medium">{copy.title}</p>
      <p className="text-muted mt-1 text-xs leading-relaxed">{copy.lead}</p>

      <ul className="mt-4 space-y-3">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <li key={benefit.title} className="flex items-start gap-3">
              <span className="bg-bg text-ink flex size-8 shrink-0 items-center justify-center rounded-2xl">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-ink text-xs font-medium">{benefit.title}</p>
                <p className="text-muted mt-0.5 text-xs leading-relaxed">{benefit.body}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={clone.isPending} onClick={startNextTrip}>
          <CopyPlus className="size-4" />
          {clone.isPending ? 'กำลังก๊อป…' : copy.cta}
        </Button>
        {/* `outline` and not `soft`: soft is #F7F7F7, which is the gray card
            this button stands on in the room and would disappear into it. */}
        {surface === 'room' ? (
          <ButtonLink variant="outline" size="sm" href={`/recap/${tripId}` as never}>
            เปิดบันทึกทริป
          </ButtonLink>
        ) : null}
      </div>

      {/* The reassurance the button needs, because "ก๊อป" is a word people have
          been burned by. Clone writes a new trip and never touches the source —
          which is the whole point of offering it here rather than a rename. */}
      <p className="text-muted mt-2.5 text-[11px] leading-relaxed">
        ใบเก่าไม่ถูกลบและไม่ถูกแก้ · ทริปใหม่ได้โครงแพลนกับปลายทางไปด้วย
        ส่วนค่าใช้จ่าย รูป และเอกสารยังอยู่กับทริปเดิม
      </p>
    </Card>
  );
}
