'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The one overlay in the app.
 *
 * Mobile-first (§2.1): a bottom sheet on a phone, a centred card from `sm` up.
 * Anything that floats above the page gets a real shadow — the only place the
 * flat rule is lifted (§15).
 *
 * It renders through a portal onto `<body>`, and that is not a detail. A
 * `backdrop-filter` anywhere up the tree makes that element the containing
 * block for `position: fixed` descendants — which is exactly what the app
 * header is (`backdrop-blur-md`, sticky). Opened from the notification bell
 * that lives inside it, `inset-0` resolved to the 56px-tall header instead of
 * the viewport, and the sheet came out straddling the top of the page with its
 * own title scrolled off-screen. On `<body>` there is nothing above it to
 * capture it.
 *
 * On a phone the whole card scrolls as one piece (F6 of Feedback #4 leaves
 * this alone on purpose — the mobile sheet was already fine). From `sm` up,
 * header and footer stop moving: only the body between them scrolls, so a
 * long form never drags its own title or save button off-screen.
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

  // `open` is always false on the first render — every caller drives it from
  // component state — so the server never reaches the portal and there is no
  // hydration mismatch to guard against. The `document` check is for the one
  // case that would crash rather than merely look wrong.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="bg-ink/35 absolute inset-0 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'bg-bg shadow-float-lg animate-rove-rise relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[2rem] p-5 sm:flex sm:max-w-md sm:flex-col sm:overflow-hidden sm:rounded-[2rem] sm:p-0',
          className,
        )}
      >
        <div className="border-border mb-4 flex items-start justify-between gap-3 sm:mb-0 sm:shrink-0 sm:border-b sm:px-6 sm:pt-6 sm:pb-4">
          <div>
            <h2 className="font-display text-ink text-lg font-medium tracking-tight">
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

        <div className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:px-6">{children}</div>

        {footer ? (
          <div className="border-border mt-5 sm:mt-0 sm:shrink-0 sm:border-t sm:px-6 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
