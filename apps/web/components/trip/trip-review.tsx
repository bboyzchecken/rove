'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { FieldLabel, Input, Textarea } from '@/components/ui/field';
import { useSaveReview, useTripReviews } from '@/features/reviews/queries';
import type { ReviewSummary, TripReview } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "แล้วจริงๆ เป็นยังไง" — the review card on บันทึกทริป (M21 — A11.5).
 *
 * The Budget tab is what the group planned to spend. This is what they
 * actually spent, and it is the number a stranger reading the published plan
 * cares about most. Saying it is optional: a review with a rating and no
 * figure is still a review.
 */
export function TripReviewCard({ tripId }: { tripId: string }) {
  const { data: board, isLoading } = useTripReviews(tripId);

  if (isLoading) {
    return (
      <section className="px-4">
        <SectionHeader label="แล้วจริงๆ เป็นยังไง" />
        <div className="rounded-brand bg-surface h-40 animate-pulse" />
      </section>
    );
  }
  if (!board) return null;

  const others = board.entries.filter((entry) => entry.userId !== board.mine?.userId);

  return (
    <section className="px-4">
      <SectionHeader label="แล้วจริงๆ เป็นยังไง" />

      <Card className="p-4">
        {board.summary.count > 0 ? <ReviewSummaryLine summary={board.summary} /> : null}

        {board.canReview ? (
          // Keyed on my saved review so the form is seeded from props rather
          // than copied into state by an effect: the row arrives after the
          // first render, and remounting is how React says "start from this".
          <ReviewForm
            key={board.mine?.createdAt ?? 'new'}
            tripId={tripId}
            mine={board.mine}
            withDivider={board.summary.count > 0}
          />
        ) : (
          <p className="text-muted text-xs">รีวิวได้หลังทริปจบแล้ว</p>
        )}
      </Card>

      {others.length > 0 ? (
        <Card className="divide-border mt-3 divide-y">
          {others.map((entry) => (
            <ReviewLine key={entry.userId} review={entry} />
          ))}
        </Card>
      ) : null}
    </section>
  );
}

function ReviewForm({
  tripId,
  mine,
  withDivider,
}: {
  tripId: string;
  mine: TripReview | null;
  withDivider: boolean;
}) {
  const save = useSaveReview(tripId);

  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [budget, setBudget] = useState(
    mine?.actualBudgetPerPerson ? String(mine.actualBudgetPerPerson) : '',
  );
  const [body, setBody] = useState(mine?.body ?? '');

  return (
    <div className={cn(withDivider && 'border-border mt-4 border-t pt-4')}>
      <FieldLabel>ให้กี่ดาว</FieldLabel>
      <StarPicker value={rating} onChange={setRating} />

      <div className="mt-3">
        <FieldLabel>ใช้จริงคนละเท่าไหร่ (บาท) — ไม่บอกก็ได้</FieldLabel>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={500}
          value={budget}
          placeholder="เช่น 52,000"
          onChange={(e) => setBudget(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <FieldLabel>อยากบอกอะไรคนที่จะไปตามแพลนนี้</FieldLabel>
        <Textarea
          rows={3}
          value={body}
          placeholder="อะไรคุ้ม อะไรข้ามได้ อะไรควรจองล่วงหน้า"
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          disabled={rating < 1 || save.isPending}
          onClick={() =>
            save.mutate({
              rating,
              actualBudgetPerPerson: Number(budget) || 0,
              body: body.trim(),
            })
          }
        >
          {save.isPending ? 'กำลังบันทึก…' : mine ? 'อัปเดตรีวิว' : 'บันทึกรีวิว'}
        </Button>
        {save.isSuccess && !save.isPending ? (
          <span className="text-success text-xs">บันทึกแล้ว</span>
        ) : null}
        {save.isError ? (
          <span className="text-warning text-xs">บันทึกไม่สำเร็จ — ลองใหม่</span>
        ) : null}
      </div>

      <p className="text-muted mt-3 text-[11px] leading-relaxed">
        รีวิวและยอดที่ใช้จริงจะแสดงบนหน้าแพลนสาธารณะ — รายการค่าใช้จ่ายในห้องไม่ถูกแชร์
      </p>
    </div>
  );
}

export function ReviewSummaryLine({ summary }: { summary: ReviewSummary }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="flex items-center gap-1.5">
        <Stars value={Math.round(summary.averageRating)} />
        <span className="text-ink nums text-sm font-medium">{summary.averageRating}</span>
        <span className="text-muted text-xs">({summary.count} รีวิว)</span>
      </span>
      {summary.budgetSaid > 0 ? (
        <span className="text-muted text-xs">
          ใช้จริงเฉลี่ย{' '}
          <span className="text-ink font-medium">
            {formatMoney(summary.actualBudgetPerPerson, 'THB')}
          </span>
          /คน · จาก {summary.budgetSaid} คนที่บอก
        </span>
      ) : null}
    </div>
  );
}

export function ReviewLine({ review }: { review: TripReview }) {
  return (
    <div className="flex gap-3 p-3.5">
      <CharacterAvatar characterId={review.characterId} size="xs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-ink text-xs font-medium">{review.name}</span>
          <Stars value={review.rating} />
        </div>
        {review.body ? (
          <p className="text-ink mt-1 text-xs leading-relaxed">{review.body}</p>
        ) : null}
        {review.actualBudgetPerPerson > 0 ? (
          <p className="text-muted mt-1 text-[11px]">
            ใช้จริง {formatMoney(review.actualBudgetPerPerson, 'THB')}/คน
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-3', n <= value ? 'fill-ink text-ink' : 'text-border')} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} ดาว`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className="hover:bg-surface rounded-full p-1 transition"
        >
          <Star className={cn('size-6', n <= value ? 'fill-ink text-ink' : 'text-border')} />
        </button>
      ))}
    </div>
  );
}
