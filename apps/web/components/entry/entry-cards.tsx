'use client';

import { useState } from 'react';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';

import { cn } from '@/lib/utils';

import { DateEntryFlow } from './date-flow';
import { CityEntryFlow } from './city-flow';
import { TicketEntryFlow } from './ticket-flow';

/**
 * M1: three ways in. The bet in DEV_SPEC §1 is that people arrive with
 * different amounts of certainty — a date, a place, or a booking confirmation —
 * and forcing all three down one form is what makes planning tools feel like
 * paperwork.
 *
 * X1.1 requires each of these to reach a created trip in at most three screens.
 */

type Entry = 'date' | 'city' | 'ticket';

const cards: Array<{
  key: Entry;
  icon: typeof CalendarDays;
  title: string;
  description: string;
  tone: string;
}> = [
  {
    key: 'date',
    icon: CalendarDays,
    title: 'เริ่มจากวันที่ลาได้',
    description: 'รู้แค่ว่าว่างช่วงไหน ที่เหลือค่อยคิด',
    tone: 'bg-primary/10 text-primary',
  },
  {
    key: 'city',
    icon: MapPin,
    title: 'เริ่มจากเมืองที่อยากไป',
    description: 'อยากไปโตเกียว โยโกฮาม่า หรือฟูจิ',
    tone: 'bg-sky/40 text-espresso',
  },
  {
    key: 'ticket',
    icon: Ticket,
    title: 'วางข้อความตั๋ว',
    description: 'จองตั๋วแล้ว วางอีเมลยืนยันมาได้เลย',
    tone: 'bg-sun/50 text-espresso',
  },
];

export function EntryCards() {
  const [active, setActive] = useState<Entry | null>(null);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setActive(card.key)}
            className={cn(
              'group rounded-brand-lg bg-surface p-5 text-left shadow-brand transition',
              'hover:-translate-y-0.5 hover:shadow-brand-lg focus-visible:-translate-y-0.5',
            )}
          >
            <span
              className={cn(
                'mb-3 inline-flex h-11 w-11 items-center justify-center rounded-brand',
                card.tone,
              )}
            >
              <card.icon className="h-5 w-5" />
            </span>
            <p className="font-display font-bold text-espresso">{card.title}</p>
            <p className="mt-1 text-sm text-muted">{card.description}</p>
          </button>
        ))}
      </div>

      <DateEntryFlow open={active === 'date'} onClose={() => setActive(null)} />
      <CityEntryFlow open={active === 'city'} onClose={() => setActive(null)} />
      <TicketEntryFlow open={active === 'ticket'} onClose={() => setActive(null)} />
    </>
  );
}
