'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Languages } from 'lucide-react';

import { setLocale } from '@/app/actions/locale';
import { LOCALES } from '@/i18n/locales';
import { cn } from '@/lib/utils';

const LABEL: Record<string, string> = { th: 'ไทย', en: 'English' };
/** Two letters is all a header has room for; the full name lives on the title. */
const SHORT: Record<string, string> = { th: 'TH', en: 'EN' };

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
      <p className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
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
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
              option === locale ? 'bg-ink text-bg' : 'bg-surface text-muted hover:bg-border',
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

/**
 * The same switch, sized for a header.
 *
 * A setting buried three taps deep in the profile menu is a setting nobody
 * finds, and language is the one choice a visitor makes before they have an
 * account to have settings in — so it rides the top bar on every surface,
 * signed in or not. Two locales fit as a segmented pair; a third would want a
 * menu.
 */
export function LocaleSwitchCompact({ className }: { className?: string }) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={cn('bg-surface flex items-center rounded-full p-0.5', className)}
      role="group"
      aria-label="ภาษา / Language"
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          onClick={() => startTransition(() => setLocale(option))}
          disabled={pending || option === locale}
          title={LABEL[option] ?? option}
          aria-current={option === locale}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide transition',
            option === locale ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
          )}
        >
          {SHORT[option] ?? option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
