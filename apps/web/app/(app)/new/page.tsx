import { Suspense } from 'react';

import { NewTripFlow } from '@/components/trip/new-trip-flow';

/** Entry flow (M1). Reads `?from=` so the landing cards can deep-link a route. */
export const metadata = { title: 'เริ่มทริปใหม่' };

export default function NewTripPage() {
  return (
    <Suspense>
      <NewTripFlow />
    </Suspense>
  );
}
