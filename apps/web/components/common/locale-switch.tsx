'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Languages } from 'lucide-react';

import { setLocale } from '@/app/actions/locale';
import { LOCALES } from '@/i18n/locales';
import { cn } from '@/lib/utils';

const LABEL: Record<string, string> = { th: 'ไทย', en: 'English' };

/**
 * The language switch (Phase 3).
 *
 * The locale belongs to the person, not to the URL, so switching writes a
 * cookie instead of forking every share link into an `/en` twin. The write is a
 * server action because next-intl reads the cookie on the server — one round
 * trip, and it still works with JavaScript off.
 *
 * It also says what it actually does. Only the keys in `messages/` are
 * translated so far, and a switcher that silently delivers a half-English app
 * is worse than one that admits it.
 */
export function LocaleSwitch() {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
        <Languages className="size-3.5" />
        ภาษา / Language
      </p>
      <div className="flex gap-1.5">
        {LOCALES.map((option) => (
          <button
            key={option}
            onClick={() => startTransition(() => setLocale(option))}
            disabled={pending || option === locale}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              option === locale ? 'bg-espresso text-bg' : 'bg-surface text-muted hover:bg-border',
            )}
          >
            {LABEL[option] ?? option}
          </button>
        ))}
      </div>
      <p className="text-muted mt-1.5 text-[11px] leading-relaxed">
        ตอนนี้แปลแล้วเฉพาะเมนูและป้ายกำกับ — เนื้อหาส่วนใหญ่ยังเป็นภาษาไทย
      </p>
    </div>
  );
}
