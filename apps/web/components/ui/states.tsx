import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Loading, empty and error states for every list in the app (W2.7 makes them a
 * requirement, not a nicety).
 *
 * Tone of voice per §15: an empty state invites the next action rather than
 * announcing emptiness, and an error says what broke and what to do — once, no
 * repeated apologies.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-brand bg-espresso/6', className)}
      aria-hidden="true"
    />
  );
}

/** A list placeholder that matches the shape of what is coming. */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="กำลังโหลด">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-brand-lg border border-dashed border-border px-6 py-10 text-center">
      {icon ? <div className="mb-3 flex justify-center text-primary">{icon}</div> : null}
      <p className="font-display font-bold text-espresso">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-brand-lg bg-danger/8 px-6 py-8 text-center">
      <p className="font-display font-bold text-danger">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-brand bg-danger px-4 py-2 text-sm font-medium text-white"
        >
          ลองอีกครั้ง
        </button>
      ) : null}
    </div>
  );
}

/**
 * The one place a query's three states are resolved, so no list forgets one.
 * Passing `data` narrows it for the render callback.
 */
export function QueryState<T>({
  isLoading,
  error,
  data,
  empty,
  skeleton,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  data: T | undefined;
  empty?: ReactNode;
  skeleton?: ReactNode;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (isLoading) return <>{skeleton ?? <SkeletonList />}</>;
  if (error) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : undefined}
        onRetry={onRetry}
      />
    );
  }
  if (!data) return <>{empty ?? null}</>;
  if (Array.isArray(data) && data.length === 0 && empty) return <>{empty}</>;
  return <>{children(data)}</>;
}
