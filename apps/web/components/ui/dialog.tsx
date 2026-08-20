'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A dialog built on <dialog>, so focus trapping, Escape and the top layer come
 * from the platform rather than from a library and a pile of listeners.
 *
 * On mobile it is a bottom sheet, because a centred modal on a 375px screen
 * puts the primary action under the thumb of nobody.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and the backdrop both fire `cancel`/`close`; route them through the
  // same callback so parent state cannot drift from the element's state.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'w-full max-w-none bg-transparent p-0 backdrop:bg-espresso/40 backdrop:backdrop-blur-sm',
        'm-0 mt-auto sm:m-auto',
        widths[size],
      )}
    >
      <div className="max-h-[85dvh] overflow-y-auto rounded-t-brand-lg bg-surface p-5 shadow-brand-lg sm:rounded-brand-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="dialog-title" className="font-display text-lg font-bold">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="-m-1 rounded-full p-1 text-muted hover:bg-espresso/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {children}

        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </dialog>
  );
}
