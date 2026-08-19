import type { ReactNode } from 'react';

/**
 * Trip room shell: header + tab navigation, with a bottom nav on mobile.
 *
 * Tabs (DEV_SPEC §3.2): overview | wishlist | plan | budget | prep | bookings |
 * discussion | compare.
 *
 * TODO(W2.1): build the real layout and wire useTripEvents() here so every tab
 * shares one SSE connection.
 */
const TABS = [
  { key: 'overview', label: 'ภาพรวม' },
  { key: 'wishlist', label: 'ที่อยากไป' },
  { key: 'plan', label: 'แพลน' },
  { key: 'budget', label: 'งบ' },
  { key: 'prep', label: 'เตรียมตัว' },
  { key: 'bookings', label: 'การจอง' },
  { key: 'discussion', label: 'คุยกัน' },
] as const;

export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b px-4 py-3">
        <p className="text-muted text-xs">trip {tripId}</p>
      </header>

      <nav className="border-border flex gap-3 overflow-x-auto border-b px-4 py-2 text-sm">
        {TABS.map((tab) => (
          <span key={tab.key} className="text-muted whitespace-nowrap">
            {tab.label}
          </span>
        ))}
      </nav>

      <div className="px-4 py-6">{children}</div>
    </div>
  );
}
