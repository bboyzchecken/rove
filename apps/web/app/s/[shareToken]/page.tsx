import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PublicPlanView } from '@/components/public/public-plan-view';
import { fetchPublicPlan } from '@/features/public/api';
import { env } from '@/lib/env';

/**
 * W10.2 — the share link page.
 *
 * noindex: a link-shared trip is "anyone with the link", not "anyone with a
 * search engine". The public slug route (/p/[slug]) is the indexable one.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const plan = await fetchPublicPlan(shareToken);

  if (!plan) notFound();

  return (
    <main>
      <PublicPlanView plan={plan} cloneHref={`/?clone=${plan.trip_id}`} />
      <p className="pb-8 text-center text-xs text-muted">
        แชร์ผ่านลิงก์จาก {env.brandName}
      </p>
    </main>
  );
}
