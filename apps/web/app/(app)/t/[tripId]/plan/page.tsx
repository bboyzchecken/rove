import { Suspense } from 'react';

import { PlanScreen } from '@/components/editor/plan-screen';

/** Plan tab (M4 + M5). */
export const metadata = { title: 'แพลน' };

export default async function PlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return (
    // A wishlist deep link (Feedback #4 — F8) lands here with `?day=&item=`,
    // which `PlanBoard` reads via `useSearchParams` — that hook opts the tree
    // out of static rendering unless it has its own Suspense boundary.
    <Suspense>
      <PlanScreen tripId={tripId} />
    </Suspense>
  );
}
