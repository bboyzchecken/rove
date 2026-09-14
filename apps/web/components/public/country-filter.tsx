'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Globe, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { bareInputClass, fieldShellClass } from '@/components/ui/field';
import { useExploreCountries } from '@/features/public/queries';
import { countryName, flagOf } from '@/lib/data/countries';
import { cn } from '@/lib/utils';

/**
 * The country filter (Feedback #2 — D-18, F4.2, เสียง 9:09).
 *
 * The city chips are gone: "อนาคต 10–100 ประเทศ" and a chip per city stops
 * scaling at about four. In their place, the thing the big travel sites do —
 * a "ประเทศ" button that opens a sheet listing every country that has a
 * public plan, most first, tick as many as you like, search the list. What is
 * ticked shows as removable chips under the search box.
 *
 * The list is the catalogue's, not a fixed table: a country appears the day
 * someone publishes a plan there.
 */
export function CountryFilterButton({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: countries = [] } = useExploreCountries();
  const t = useTranslations('explore');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'font-display inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition',
          selected.length > 0 ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-border',
        )}
      >
        <Globe className="size-4" />
        {t('country')}
        {selected.length > 0 ? (
          <span className="bg-bg/20 nums rounded-full px-1.5 text-[11px]">{selected.length}</span>
        ) : null}
      </button>

      <CountrySheet
        open={open}
        onClose={() => setOpen(false)}
        countries={countries}
        selected={selected}
        onChange={onChange}
      />
    </>
  );
}

/** The chips under the search box — one per ticked country, each removable. */
export function CountryChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  if (selected.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(selected.filter((c) => c !== code))}
          aria-label={`เอา ${countryName(code)} ออก`}
          className="bg-ink text-bg inline-flex items-center gap-1.5 rounded-full py-1 pr-2 pl-3 text-xs font-medium"
        >
          {flagOf(code)} {countryName(code)}
          <X className="size-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange([])}
        className="text-muted hover:text-ink px-1.5 text-[11px] font-medium"
      >
        ล้างทั้งหมด
      </button>
    </div>
  );
}

function CountrySheet({
  open,
  onClose,
  countries,
  selected,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  countries: { code: string; count: number }[];
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries.filter((row) => {
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        countryName(row.code, 'th').toLowerCase().includes(q) ||
        countryName(row.code, 'en').toLowerCase().includes(q)
      );
    });
  }, [countries, query]);

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="เลือกประเทศ"
      description="ติ๊กได้หลายประเทศ — เรียงตามจำนวนแพลนที่มี"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="soft" size="md" onClick={() => onChange([])} disabled={selected.length === 0}>
            ล้าง
          </Button>
          <Button block size="md" onClick={onClose}>
            {selected.length > 0 ? `ดูแพลน ${selected.length} ประเทศ` : 'ดูทุกประเทศ'}
          </Button>
        </div>
      }
    >
      <label className={cn(fieldShellClass, 'mb-3')}>
        <Search className="text-muted size-4 shrink-0" />
        <input
          className={cn(bareInputClass, 'ml-2')}
          placeholder="ค้นหาประเทศ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>

      {rows.length === 0 ? (
        <p className="text-muted py-6 text-center text-xs">
          {countries.length === 0 ? 'ยังไม่มีแพลนสาธารณะ' : 'ไม่พบประเทศที่ค้นหา'}
        </p>
      ) : (
        <ul className="max-h-[50dvh] space-y-1 overflow-y-auto">
          {rows.map((row) => {
            const on = selected.includes(row.code);
            return (
              <li key={row.code}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(row.code)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition',
                    on ? 'bg-feature' : 'hover:bg-surface',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-md',
                      on ? 'bg-ink text-bg' : 'border-muted/40 border-2',
                    )}
                  >
                    {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="text-lg leading-none">{flagOf(row.code)}</span>
                  <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">
                    {countryName(row.code)}
                    <span className="text-muted ml-1.5 text-[11px] font-normal">
                      {countryName(row.code, 'en')}
                    </span>
                  </span>
                  <span className="text-muted nums text-[11px]">{row.count} แพลน</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
