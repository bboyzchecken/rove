'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';

import { CITY_OPTIONS, addDays, suggestDays, todayISO, useEntrySubmit } from './use-entry';

/**
 * W1.3 — "I know where I want to go". Picking cities suggests a day count
 * (Kamakura is a day trip, Tokyo is not), and the suggestion pre-fills the
 * dates so the common case is two taps and done.
 */
export function CityEntryFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cities, setCities] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState(5);
  const [partySize, setPartySize] = useState(2);
  // Once the user edits the day count themselves, adding a city must stop
  // overwriting it.
  const [daysTouched, setDaysTouched] = useState(false);

  const { submit, isPending, error } = useEntrySubmit();

  function toggleCity(key: string) {
    const next = cities.includes(key) ? cities.filter((c) => c !== key) : [...cities, key];
    setCities(next);
    if (!daysTouched) setDays(suggestDays(next));
  }

  const canSubmit = cities.length > 0 && Boolean(startDate);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เริ่มจากเมืองที่อยากไป"
      description="เลือกเมืองแล้วเราจะแนะนำจำนวนวันให้"
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
                entry_type: 'city',
                cities,
                start_date: startDate,
                // days is inclusive, so a 5-day trip ends 4 nights later.
                end_date: addDays(startDate, days - 1),
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
        <div>
          <p className="mb-2 text-sm font-medium text-espresso">อยากไปเมืองไหน</p>
          <div className="flex flex-wrap gap-2">
            {CITY_OPTIONS.map((city) => {
              const selected = cities.includes(city.key);
              return (
                <button
                  key={city.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCity(city.key)}
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

        {cities.length > 0 ? (
          <p className="rounded-brand bg-sky/25 px-3 py-2 text-sm text-espresso">
            เมืองที่เลือกน่าจะใช้เวลาราว {suggestDays(cities)} วัน
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="วันไป">
            <Input
              type="date"
              value={startDate}
              min={todayISO()}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="ไปกี่วัน">
            <Input
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => {
                setDaysTouched(true);
                setDays(Number(e.target.value) || 1);
              }}
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

        {error ? <p className="text-sm text-danger">{(error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
