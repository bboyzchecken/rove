'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { nightsBetween } from '@/lib/format';

import { CITY_OPTIONS, todayISO, useEntrySubmit } from './use-entry';

/**
 * W1.2 — "I know when I can take leave". Dates are required; the city is
 * optional, because the whole point of this entry is that the user has not
 * decided yet.
 */
export function DateEntryFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [partySize, setPartySize] = useState(2);

  const { submit, isPending, error } = useEntrySubmit();

  const nights = nightsBetween(startDate, endDate);
  const rangeInvalid = Boolean(startDate && endDate && nights < 0);
  const canSubmit = Boolean(startDate && endDate) && !rangeInvalid;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เริ่มจากวันที่ลาได้"
      description="ใส่ช่วงวันก่อน แล้วค่อยชวนเพื่อนมาช่วยคิดว่าจะไปไหน"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={isPending}
            disabled={!canSubmit}
            onClick={() =>
              void submit({
                entry_type: 'date',
                start_date: startDate,
                end_date: endDate,
                cities,
                party_size: partySize,
              })
            }
          >
            สร้างทริป
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="วันไป">
            <Input
              type="date"
              value={startDate}
              min={todayISO()}
              onChange={(e) => {
                setStartDate(e.target.value);
                // An end date now before the start is worse than no end date.
                if (endDate && e.target.value > endDate) setEndDate('');
              }}
            />
          </Field>
          <Field label="วันกลับ" error={rangeInvalid ? 'ต้องไม่มาก่อนวันไป' : undefined}>
            <Input
              type="date"
              value={endDate}
              min={startDate || todayISO()}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        {nights > 0 ? (
          <p className="text-sm text-muted">
            {nights} คืน · {nights + 1} วัน
          </p>
        ) : null}

        <Field label="ไปกันกี่คน">
          <Input
            type="number"
            min={1}
            max={30}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value) || 1)}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-espresso">
            เมืองที่คิดไว้ <span className="font-normal text-muted">(ข้ามได้)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {CITY_OPTIONS.map((city) => {
              const selected = cities.includes(city.key);
              return (
                <button
                  key={city.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setCities((prev) =>
                      selected ? prev.filter((c) => c !== city.key) : [...prev, city.key],
                    )
                  }
                  className={
                    selected
                      ? 'rounded-full bg-primary px-3 py-1.5 text-sm text-primary-fg'
                      : 'rounded-full bg-espresso/6 px-3 py-1.5 text-sm text-muted hover:bg-espresso/10'
                  }
                >
                  {city.label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? <p className="text-sm text-danger">{(error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
