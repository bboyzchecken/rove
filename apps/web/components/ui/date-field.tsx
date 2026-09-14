'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';

import { FieldLabel, fieldShellClass, bareInputClass } from '@/components/ui/field';
import { MonthGrid, MonthNav } from '@/components/ui/month-grid';
import { formatDmy, monthOfIso, parseDmy, toIsoDate } from '@/lib/data/domain';
import { cn } from '@/lib/utils';

/**
 * The date field (Feedback #2 — D-7, F0.2).
 *
 * Replaces every `<input type="date">` in the app. The native control draws
 * itself differently on every OS — `mm/dd/yyyy` on the tester's laptop, a
 * wheel on their phone — and the tester read "04/12/2026" as two different
 * days on two devices. This one always shows `dd/mm/yyyy`, always the
 * Gregorian year, and always the same month grid the availability calendar
 * uses, so a date looks like one thing everywhere in the product.
 *
 * Two ways in: type it, or tap the calendar. Typing is forgiving (see
 * `parseDmy`) and settles on blur; the calendar settles on tap. Empty is a
 * real value — nothing here ever fills in "today" behind the user's back,
 * which is the D-8 rule that every field in the entry flow starts blank.
 */
export function DateField({
  value,
  onChange,
  label,
  hint,
  min,
  max,
  placeholder = 'วว/ดด/ปปปป',
  disabled = false,
  clearable = true,
  className,
  'aria-label': ariaLabel,
  autoFocus,
}: {
  /** ISO "yyyy-mm-dd" or "". */
  value: string;
  onChange: (iso: string) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(() => formatDmy(value));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOfIso(value || min));
  const box = useRef<HTMLDivElement>(null);

  // The parent is the source of truth: when it changes the value (a ticket
  // paste, a reset), the typed text follows. Adjusted during render rather
  // than in an effect, per React's own guidance for state derived from props.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setText(formatDmy(value));
    if (value) setMonth(monthOfIso(value));
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setText('');
      if (value) onChange('');
      return;
    }
    const iso = parseDmy(trimmed);
    if (iso && inRange(iso, min, max)) {
      setText(formatDmy(iso));
      if (iso !== value) onChange(iso);
    } else {
      // Not a date: put back whatever was there rather than keep a lie.
      setText(formatDmy(value));
    }
  }

  function typed(raw: string) {
    // Digits and slashes only, slashes inserted where a hand would put them.
    const digits = raw.replace(/[^\d]/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(out);
    if (digits.length === 8) {
      const iso = parseDmy(out);
      if (iso && inRange(iso, min, max) && iso !== value) onChange(iso);
    }
  }

  const today = toIsoDate(new Date());

  return (
    <div className={cn('relative block min-w-0', className)} ref={box}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}

      <div className={cn(fieldShellClass, disabled && 'opacity-60')}>
        <input
          value={text}
          onChange={(e) => typed(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
              setOpen(false);
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          autoFocus={autoFocus}
          className={cn(bareInputClass, 'nums')}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="ล้างวันที่"
            onClick={() => {
              setText('');
              onChange('');
            }}
            className="text-muted hover:text-ink -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="เปิดปฏิทิน"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'hover:text-ink -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            open ? 'text-ink' : 'text-muted',
          )}
        >
          <CalendarDays className="size-4" />
        </button>
      </div>

      {hint ? <span className="text-muted mt-1 block text-[11px]">{hint}</span> : null}

      {open ? (
        <div className="bg-bg border-field-border shadow-float-lg animate-rove-rise absolute left-0 z-30 mt-1.5 w-[18.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border p-3">
          <MonthNav
            month={month}
            onChange={setMonth}
            canPrev={!min || month > monthOfIso(min)}
            canNext={!max || month < monthOfIso(max)}
            className="mb-2"
          />
          <MonthGrid
            month={month}
            gap="gap-0.5"
            renderDay={(iso, day) => {
              const selected = iso === value;
              const allowed = inRange(iso, min, max);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={selected}
                  aria-label={formatDmy(iso)}
                  onClick={() => {
                    onChange(iso);
                    setText(formatDmy(iso));
                    setOpen(false);
                  }}
                  className={cn(
                    'nums flex h-9 items-center justify-center rounded-xl text-[13px] font-medium transition',
                    selected
                      ? 'bg-ink text-bg'
                      : allowed
                        ? 'text-ink hover:bg-surface'
                        : 'text-muted/40',
                    iso === today && !selected && 'ring-ink/30 ring-1',
                  )}
                >
                  {day}
                </button>
              );
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setMonth(monthOfIso(today));
              }}
              className="text-muted hover:text-ink text-[11px] font-medium"
            >
              ไปเดือนนี้
            </button>
            <span className="text-muted/70 text-[10px]">วัน/เดือน/ปี ค.ศ.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function inRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}
