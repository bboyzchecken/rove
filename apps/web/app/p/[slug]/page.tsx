import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PublicPlanView } from '@/components/public/public-plan-view';
import { countPublicView, fetchPublicPlan } from '@/features/public/api';
import { env } from '@/lib/env';

/**
 * A fully public trip, at a readable slug. Unlike /s/[token] this one is
 * indexable — it is the page the whole public-trip incentive depends on being
 * findable (DEV_SPEC §1).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const plan = await fetchPublicPlan(slug);
  if (!plan) return { title: 'ไม่พบทริปนี้' };

  const description =
    plan.summary ||
    `แพลนเที่ยว${plan.destination_cities.join(' ')} ${plan.days} วัน โดย ${plan.author.display_name}`;

  return {
    title: plan.title,
    description,
    openGraph: {
      title: plan.title,
      description,
      type: 'article',
      siteName: env.brandName,
      images: plan.cover_image_url ? [plan.cover_image_url] : undefined,
    },
  };
}

export default async function PublicPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const plan = await fetchPublicPlan(slug);

  if (!plan) notFound();

  // Fire and forget; a missed count is never worth a slower page.
  void countPublicView(slug);

  return (
    <main>
      <PublicPlanView plan={plan} cloneHref={`/?clone=${plan.trip_id}`} />
    </main>
  );
}
