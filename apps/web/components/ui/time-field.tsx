'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';

import { FieldLabel, fieldShellClass, bareInputClass } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * The time field (Feedback #4 — F1, D-1).
 *
 * `DateField`'s twin for a clock time. Built new rather than reusing
 * `<input type="time" min>` because a native time input does not fade or
 * disable the choices before `min` — it just fails validation silently on
 * submit — and D-1 asks for the same "picked, but before the start, so it is
 * greyed out and cannot be tapped" feeling `DateField` already gives dates.
 *
 * Crossing midnight is not represented (Feedback #4 F1): a plan item that
 * runs past 00:00 leaves its end blank rather than lying about which day it
 * lands on.
 */
export function TimeField({
  value,
  onChange,
  label,
  hint,
  min,
  max,
  placeholder = 'ชม:นาที',
  disabled = false,
  clearable = true,
  className,
  'aria-label': ariaLabel,
}: {
  /** "HH:mm" or "". */
  value: string;
  onChange: (hhmm: string) => void;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setText(value);
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
    const hhmm = parseClock(trimmed);
    if (hhmm && inRange(hhmm, min, max)) {
      setText(hhmm);
      if (hhmm !== value) onChange(hhmm);
    } else {
      setText(value);
    }
  }

  function typed(raw: string) {
    const digits = raw.replace(/[^\d]/g, '').slice(0, 4);
    const out = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setText(out);
    if (digits.length === 4) {
      const hhmm = parseClock(out);
      if (hhmm && inRange(hhmm, min, max) && hhmm !== value) onChange(hhmm);
    }
  }

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
          className={cn(bareInputClass, 'nums')}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="ล้างเวลา"
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
          aria-label="เลือกเวลา"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'hover:text-ink -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            open ? 'text-ink' : 'text-muted',
          )}
        >
          <Clock className="size-4" />
        </button>
      </div>

      {hint ? <span className="text-muted mt-1 block text-[11px]">{hint}</span> : null}

      {open ? (
        <div className="bg-bg border-field-border shadow-float-lg animate-rove-rise absolute left-0 z-30 mt-1.5 max-h-64 w-48 overflow-y-auto rounded-2xl border p-2">
          <div className="grid grid-cols-3 gap-1">
            {QUARTER_HOURS.map((hhmm) => {
              const selected = hhmm === value;
              const allowed = inRange(hhmm, min, max);
              return (
                <button
                  key={hhmm}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(hhmm);
                    setText(hhmm);
                    setOpen(false);
                  }}
                  className={cn(
                    'nums rounded-lg py-1.5 text-[12px] font-medium transition',
                    selected
                      ? 'bg-ink text-bg'
                      : allowed
                        ? 'text-ink hover:bg-surface'
                        : 'text-muted/40',
                  )}
                >
                  {hhmm}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const QUARTER_HOURS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function parseClock(raw: string): string | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function inRange(hhmm: string, min?: string, max?: string) {
  if (min && hhmm < min) return false;
  if (max && hhmm > max) return false;
  return true;
}
