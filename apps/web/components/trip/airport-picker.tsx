'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plane, Search, X } from 'lucide-react';

import { repo } from '@/lib/data';
import type { Airport } from '@/lib/data';
import { airportLabel, flagOf } from '@/lib/data/airports';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/**
 * Airport search (M1 — W1.3).
 *
 * This is the field that replaced "พิมพ์ชื่อเมือง". A city name was a guess we
 * then had to interpret — "โซล, อูเอโนะ" could be two countries or one city and
 * a neighbourhood, and the plan could not tell. An airport is a fact: one
 * place, one country, one timezone, and the code is what is printed on the
 * ticket the group is holding.
 *
 * It searches the whole world, like a flight-booking site: type NRT, Tokyo,
 * โตเกียว or Japan.
 */
export function AirportPicker({
  value,
  code,
  onChange,
  label,
  placeholder = 'พิมพ์รหัสสนามบิน เมือง หรือประเทศ',
  autoFocus = false,
}: {
  value: Airport | null;
  /**
   * The code this field holds while its row is still being fetched. Without it
   * a chosen airport blinks back to an empty search box on every reload, and a
   * field that looks empty is a field people re-type.
   */
  code?: string;
  onChange: (airport: Airport | null) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounced(query, 160);
  const { data: results, isFetching } = useQuery({
    queryKey: queryKeys.airports(debounced),
    queryFn: () => repo.airports.search(debounced, 8),
    // The empty query is a real query: it answers with the hubs.
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const options = useMemo(() => results ?? [], [results]);
  const chosen = value?.iata ?? (code ? code.toUpperCase() : '');

  // Clicking anywhere else closes the list without changing the choice.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(airport: Airport) {
    onChange(airport);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      const picked = options[highlight];
      if (picked) {
        event.preventDefault();
        choose(picked);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="block" ref={boxRef}>
      {label ? (
        <span className="text-muted mb-1.5 block text-[11px] font-semibold">{label}</span>
      ) : null}

      {chosen && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-surface flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left"
        >
          <span className="text-lg leading-none">{value ? flagOf(value.countryCode) : '✈️'}</span>
          <span className="min-w-0 flex-1">
            <span className="text-espresso nums block text-sm font-bold">
              {value ? airportLabel(value) : chosen}
            </span>
            <span className="text-muted block truncate text-[11px]">
              {value ? `${value.name} · ${value.countryTh}` : 'กำลังโหลดข้อมูลสนามบิน…'}
            </span>
          </span>
          <X
            className="text-muted size-4 shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              onChange(null);
            }}
          />
        </button>
      ) : (
        <div className="relative">
          <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <input
            value={query}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQuery(e.target.value);
              // A new query means a new list: never leave the cursor on row 4.
              setHighlight(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="bg-surface text-espresso w-full rounded-2xl py-2.5 pr-3.5 pl-9 text-sm outline-none"
          />
        </div>
      )}

      {open ? (
        <div className="bg-surface animate-rove-rise mt-1.5 max-h-72 overflow-y-auto rounded-2xl p-1">
          {options.length === 0 ? (
            <p className="text-muted px-3 py-3 text-xs">
              {isFetching ? 'กำลังค้นหา…' : 'ไม่พบสนามบินที่ตรง — ลองใส่รหัส 3 ตัวจากตั๋ว เช่น NRT'}
            </p>
          ) : (
            <>
              {!debounced ? (
                <p className="text-muted px-3 pt-2 pb-1 text-[11px] font-semibold">
                  ที่คนไทยไปบ่อย
                </p>
              ) : null}
              {options.map((airport, index) => (
                <button
                  key={airport.iata}
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(airport)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition',
                    index === highlight ? 'bg-bg' : '',
                  )}
                >
                  <span className="text-lg leading-none">{flagOf(airport.countryCode)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-espresso block truncate text-sm font-semibold">
                      {airport.cityTh || airport.city}
                      <span className="text-muted ml-1.5 text-[11px] font-normal">
                        {airport.countryTh}
                      </span>
                    </span>
                    <span className="text-muted block truncate text-[11px]">
                      {airport.nameTh ? `${airport.nameTh} · ` : ''}
                      {airport.name}
                    </span>
                  </span>
                  <span className="bg-espresso text-bg nums font-display shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold">
                    {airport.iata}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}

      {!chosen && !open ? (
        <p className="text-muted mt-1 flex items-center gap-1 text-[11px]">
          <Plane className="size-3" /> ค้นหาสนามบินได้ทั่วโลก
        </p>
      ) : null}
    </div>
  );
}

/** Keeps the index from being hit on every keystroke. */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
