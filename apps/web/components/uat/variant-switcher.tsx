'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';

import { useVariantSwitch } from '@/components/uat/variant-provider';
import { UAT_VARIANTS_ENABLED, VARIANTS, VARIANT_KEYS, type VariantKey } from '@/lib/uat/variants';
import { cn } from '@/lib/utils';

/**
 * The floating A/B/C button (F0.1 — D-5).
 *
 * Bottom right, above the phone's bottom bar, on every screen — a tester who
 * is looking at the thing they want to compare should not have to leave it to
 * switch. Nothing here is styled to look like the product: it is a tool for
 * judging the product, and it should read as one.
 *
 * Renders nothing unless the build was made with `NEXT_PUBLIC_UAT_VARIANTS=1`.
 */
export function VariantSwitcher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const { selection, setVariant } = useVariantSwitch();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
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

  if (!UAT_VARIANTS_ENABLED) return null;
  // Trip Mode is the one screen that gets the whole viewport (W10.6).
  if (pathname.endsWith('/now')) return null;

  // The keys that matter on THIS screen come first; the rest stay reachable
  // below a divider so a tester can set everything up in one place.
  const relevant = relevantKeys(pathname);
  const others = VARIANT_KEYS.filter((key) => !relevant.includes(key));

  return (
    <div
      ref={panel}
      className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 md:bottom-6"
    >
      {open ? (
        <div className="bg-bg border-border shadow-float-lg animate-rove-rise mb-2 w-[19rem] rounded-2xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ink text-xs font-medium">เลือกแบบที่อยากดู</p>
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setOpen(false)}
              className="text-muted hover:bg-surface flex size-7 items-center justify-center rounded-full"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {[...relevant, ...others].map((key, index) => (
              <div key={key}>
                {index === relevant.length && relevant.length > 0 ? (
                  <p className="text-muted/70 mb-2 border-t pt-2 text-[10px]">หน้าอื่น</p>
                ) : null}
                <p className="text-ink text-[11px] font-medium">{VARIANTS[key].label}</p>
                <p className="text-muted mb-1.5 text-[10px]">{VARIANTS[key].hint}</p>
                <div className="flex flex-wrap gap-1">
                  {VARIANTS[key].options.map((option) => {
                    const active = selection[key] === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setVariant(key, option.id as never)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                          active ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-border',
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label="สลับแบบ A/B/C"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="bg-ink text-bg shadow-float ml-auto flex h-11 items-center gap-2 rounded-full px-4 text-xs font-medium"
      >
        <SlidersHorizontal className="size-4" />
        {summary(selection, relevant)}
      </button>
    </div>
  );
}

function relevantKeys(pathname: string): VariantKey[] {
  if (pathname === '/' || pathname.startsWith('/landing')) return ['landing'];
  if (/^\/t\/[^/]+\/dates/.test(pathname)) return ['avail-colors', 'flower'];
  if (pathname.startsWith('/t/')) return ['trip-tabs', 'flower'];
  return ['flower'];
}

/** "แท็บ A · ดอกไม้ 1" — what the button says without opening it. */
function summary(selection: Record<VariantKey, string>, keys: VariantKey[]) {
  return keys
    .map((key) => {
      const option = VARIANTS[key].options.find((o) => o.id === selection[key]);
      return option ? option.label.split(' · ')[0] : '';
    })
    .filter(Boolean)
    .join(' · ');
}
