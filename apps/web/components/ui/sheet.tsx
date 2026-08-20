'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The one overlay in the app.
 *
 * Mobile-first (§2.1): a bottom sheet on a phone, a centred card from `sm` up.
 * Anything that floats above the page gets a real shadow — the only place the
 * flat rule is lifted (§15).
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="bg-espresso/35 absolute inset-0 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'bg-bg shadow-warm-lg animate-rove-rise relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[2rem] p-5 sm:max-w-md sm:rounded-[2rem]',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-espresso text-lg font-extrabold tracking-tight">
              {title}
            </h2>
            {description ? <p className="text-muted mt-0.5 text-xs">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="text-muted hover:bg-surface -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </div>

        {children}

        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    </div>
  );
}
