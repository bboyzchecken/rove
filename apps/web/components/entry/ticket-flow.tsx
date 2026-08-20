'use client';

import { useState } from 'react';
import { Plane } from 'lucide-react';

import { useParseTicket } from '@/features/ai/queries';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { formatTripTime } from '@/lib/format';
import type { ParsedTicket } from '@/types/api';

import { useEntrySubmit } from './use-entry';

/**
 * W1.4 — "I already booked". Paste the confirmation email, see the flights that
 * were found, confirm.
 *
 * The preview step is not decoration: the model is reading unstructured text,
 * and a wrong arrival time silently corrupts the whole itinerary frame. The
 * user checks it once, here, before anything is created.
 */
export function TicketEntryFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedTicket | null>(null);
  const [partySize, setPartySize] = useState(2);

  const parse = useParseTicket();
  const { submit, isPending, error } = useEntrySubmit();

  function reset() {
    setText('');
    setParsed(null);
    parse.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={reset}
      title="วางข้อความตั๋ว"
      description="วางอีเมลยืนยันหรือข้อความจากสายการบินมาได้เลย"
      size="lg"
      footer={
        parsed ? (
          <>
            <Button variant="ghost" onClick={() => setParsed(null)}>
              แก้ข้อความ
            </Button>
            <Button
              loading={isPending}
              onClick={() =>
                void submit({
                  entry_type: 'ticket',
                  title: parsed.suggested_title,
                  start_date: parsed.start_date || undefined,
                  end_date: parsed.end_date || undefined,
                  party_size: partySize,
                  flights: parsed.flights,
                })
              }
            >
              ใช้ข้อมูลนี้ สร้างทริป
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={reset}>
              ยกเลิก
            </Button>
            <Button
              loading={parse.isPending}
              disabled={text.trim().length < 20}
              onClick={async () => setParsed(await parse.mutateAsync(text))}
            >
              อ่านข้อความ
            </Button>
          </>
        )
      }
    >
      {parsed ? (
        <div className="space-y-4">
          {parsed.flights.length === 0 ? (
            <p className="rounded-brand bg-sun/40 px-3 py-2 text-sm text-espresso">
              อ่านเที่ยวบินจากข้อความนี้ไม่ออก สร้างทริปเปล่าไปก่อนแล้วค่อยใส่เที่ยวบินทีหลังก็ได้
            </p>
          ) : (
            <ul className="space-y-2">
              {parsed.flights.map((flight, i) => (
                <li key={i} className="flex items-start gap-3 rounded-brand bg-sky/25 p-3">
                  <Plane
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      flight.direction === 'return' ? 'rotate-180' : ''
                    }`}
                  />
                  <div className="text-sm">
                    <p className="font-medium text-espresso">
                      {flight.airline} {flight.flight_no} · {flight.dep_airport} →{' '}
                      {flight.arr_airport}
                    </p>
                    <p className="text-muted">
                      ออก {formatTripTime(flight.dep_at)} · ถึง {formatTripTime(flight.arr_at)}{' '}
                      <span className="text-xs">(เวลาญี่ปุ่น)</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Field label="ชื่อทริป">
            <Input
              value={parsed.suggested_title}
              onChange={(e) => setParsed({ ...parsed, suggested_title: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="วันไป">
              <Input
                type="date"
                value={parsed.start_date}
                onChange={(e) => setParsed({ ...parsed, start_date: e.target.value })}
              />
            </Field>
            <Field label="วันกลับ">
              <Input
                type="date"
                value={parsed.end_date}
                onChange={(e) => setParsed({ ...parsed, end_date: e.target.value })}
              />
            </Field>
          </div>

          <Field label="ไปกันกี่คน">
            <Input
              type="number"
              min={1}
              max={30}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value) || 1)}
            />
          </Field>

          <p className="text-xs text-muted">
            ตรวจให้แน่ใจก่อนนะ — เวลาเครื่องลงคือกรอบที่ AI ใช้วางวันแรกทั้งวัน
          </p>
          {error ? <p className="text-sm text-danger">{(error as Error).message}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={'วางอีเมลยืนยันตั๋วทั้งฉบับมาได้เลย ไม่ต้องตัดอะไรออก\n\nเช่น\nTG640 BKK 22:45 → HND 06:55 (7 เม.ย.)\nTG683 HND 00:20 → BKK 04:50 (12 เม.ย.)'}
          />
          {parse.error ? (
            <p className="text-sm text-danger">
              {(parse.error as Error).message}
            </p>
          ) : null}
          <p className="text-xs text-muted">ข้อความจะถูกส่งไปให้ AI อ่านครั้งเดียว ไม่ได้เก็บไว้</p>
        </div>
      )}
    </Dialog>
  );
}
