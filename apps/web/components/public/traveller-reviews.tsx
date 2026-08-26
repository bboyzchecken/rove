'use client';

import Link from 'next/link';

import { SectionHeader } from '@/components/common/section';
import { Stars } from '@/components/trip/trip-review';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { useRecentReviews } from '@/features/public/queries';
import type { PublicReview } from '@/lib/data';
import { formatMoney } from '@/lib/format';

/**
 * "คนที่เที่ยวตามบอกว่า" (M24 — W24.2).
 *
 * A view count says a page was opened. A clone count says somebody liked the
 * look of it. Neither says the trip was any good — that only comes from
 * somebody who went, which is exactly what `trip_reviews` has been collecting
 * since A11.5 and what nothing outside the trip room ever showed.
 *
 * Only reviews with something written in them reach here (the API filters an
 * empty body out): a five-star rating with no words is counted by the summary
 * and must never be dressed up as a testimonial.
 */

/** Fewer than this and it reads as "we found three friends", so show nothing. */
const MIN_REVIEWS = 3;

export function TravellerReviewsSection({
  className,
  limit = 6,
  label = 'คนที่เที่ยวตามบอกว่า',
}: {
  className?: string;
  limit?: number;
  label?: string;
}) {
  const { data: reviews } = useRecentReviews();

  if (!reviews || reviews.length < MIN_REVIEWS) return null;

  return (
    <section className={className}>
      <SectionHeader label={label} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.slice(0, limit).map((review) => (
          <ReviewCard key={`${review.tripId}-${review.createdAt}`} review={review} />
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <Stars value={review.rating} />

      <p className="text-espresso mt-3 flex-1 text-sm leading-relaxed">
        {/* No truncation with an ellipsis: a review cut mid-sentence reads as
            an edited one. Long ones are simply long. */}
        {review.body}
      </p>

      <div className="mt-4 flex items-center gap-2.5">
        <CharacterAvatar characterId={review.characterId} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-espresso truncate text-xs font-semibold">{review.name}</p>
          {/* The trip is the point: it is what the reader can go and copy. It
              only links when the plan is still published — an unpublished one
              keeps its name and loses its link rather than 404ing. */}
          {review.tripSlug ? (
            <Link
              href={`/p/${review.tripSlug}` as never}
              className="text-muted hover:text-primary truncate text-[11px] transition"
            >
              {review.tripTitle}
            </Link>
          ) : (
            <p className="text-muted truncate text-[11px]">{review.tripTitle}</p>
          )}
        </div>

        {review.actualBudgetPerPerson > 0 ? (
          <span className="text-muted nums shrink-0 text-[11px]">
            ใช้จริง {formatMoney(review.actualBudgetPerPerson, 'THB')}/คน
          </span>
        ) : null}
      </div>
    </Card>
  );
}
