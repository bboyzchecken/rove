'use client';

import { use, useEffect, useState } from 'react';
import { ArrowRight, EyeOff, Info, Plus, Trash2 } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import { useDeleteExpense, useExpenses, useExpenseSummary } from '@/features/expense/queries';
import { useTripOverview } from '@/features/trip/queries';
import { ExpenseForm } from '@/components/expense/expense-form';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { track } from '@/lib/analytics';
import { formatMoney, formatRelative } from '@/lib/format';
import type { ExpenseCategory } from '@/types/api';

/**
 * M16 — the Expense tab: money actually spent, and who owes whom.
 *
 * Kept visibly separate from Budget (W16.1). The two answer different
 * questions and mixing them is the mistake this split exists to prevent.
 */

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'อาหาร',
  stay: 'ที่พัก',
  transport: 'เดินทาง',
  ticket: 'ค่าเข้า/ตั๋ว',
  shopping: 'ช้อปปิ้ง',
  other: 'อื่น ๆ',
};

export default function ExpensePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [adding, setAdding] = useState(false);

  const { data: me } = useMe();
  const { data: overview } = useTripOverview(tripId);
  const { data: summary, isLoading: summaryLoading } = useExpenseSummary(tripId);
  const { data: list, isLoading, error, refetch } = useExpenses(tripId);
  const deleteExpense = useDeleteExpense(tripId);

  useEffect(() => {
    track({ name: 'expense_summary_viewed' });
  }, []);

  if (isLoading || summaryLoading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState onRetry={() => void refetch()} />;

  const entries = list?.items ?? [];
  const canEdit = overview ? overview.my_role !== 'viewer' : false;
  const nameOf = (userId: string) =>
    summary?.members[userId]?.display_name ?? 'สมาชิก';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">รายจ่ายจริง</h2>
          <p className="text-sm text-muted">เงินที่จ่ายไปแล้ว แยกจากงบที่ประมาณไว้</p>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            บันทึก
          </Button>
        ) : null}
      </div>

      {/* W16.5 — say it plainly, so nobody has to wonder before publishing. */}
      <p className="flex items-center gap-1.5 rounded-brand bg-espresso/5 px-3 py-2 text-xs text-muted">
        <EyeOff className="h-3.5 w-3.5 shrink-0" />
        แท็บนี้ไม่แสดงให้คนนอกทริปเห็นเลย แม้จะเปิดทริปเป็นสาธารณะ
      </p>

      {summary && summary.total > 0 ? (
        <>
          <Card tone="matcha">
            <CardHeader>
              <div>
                <CardTitle>ใช้ไปแล้วทั้งหมด</CardTitle>
                <CardDescription>
                  หารกัน {formatMoney(summary.shared_total, summary.currency)} · ส่วนตัว{' '}
                  {formatMoney(summary.total - summary.shared_total, summary.currency)}
                </CardDescription>
              </div>
              <p className="font-display text-2xl font-bold text-espresso">
                {formatMoney(summary.total, summary.currency)}
              </p>
            </CardHeader>

            <p className="flex items-start gap-1.5 text-xs text-espresso/60">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {summary.fx_rate_note}
            </p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ใครจ่ายไปเท่าไหร่</CardTitle>
            </CardHeader>
            <ul className="space-y-2">
              {summary.per_member.map((balance) => {
                const member = summary.members[balance.user_id];
                return (
                  <li key={balance.user_id} className="flex items-center gap-3">
                    <Avatar
                      name={member?.display_name ?? 'สมาชิก'}
                      avatarUrl={member?.avatar_url}
                      characterId={member?.character_id}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-espresso">
                        {member?.display_name ?? 'สมาชิก'}
                      </p>
                      <p className="text-xs text-muted">
                        จ่ายไป {formatMoney(balance.paid, summary.currency)} · ส่วนที่ต้องรับผิดชอบ{' '}
                        {formatMoney(balance.owed, summary.currency)}
                        {balance.personal > 0
                          ? ` · ส่วนตัว ${formatMoney(balance.personal, summary.currency)}`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={
                        balance.net > 0
                          ? 'text-sm font-medium text-matcha'
                          : balance.net < 0
                            ? 'text-sm font-medium text-danger'
                            : 'text-sm text-muted'
                      }
                    >
                      {balance.net > 0 ? '+' : ''}
                      {formatMoney(balance.net, summary.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {summary.settlements.length > 0 ? (
            <Card tone="sun">
              <CardHeader>
                <div>
                  <CardTitle>เคลียร์กันแบบนี้จบเลย</CardTitle>
                  <CardDescription>
                    โอนตามนี้ {summary.settlements.length} ครั้ง แล้วทุกคนเท่ากัน
                  </CardDescription>
                </div>
              </CardHeader>
              <ul className="space-y-2">
                {summary.settlements.map((settlement, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-espresso">
                      {nameOf(settlement.from_user_id)}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-espresso/50" />
                    <span className="font-medium text-espresso">
                      {nameOf(settlement.to_user_id)}
                    </span>
                    <span className="ml-auto font-display font-bold text-espresso">
                      {formatMoney(settlement.amount, summary.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <p className="rounded-brand bg-matcha/25 px-3 py-2 text-center text-sm text-espresso">
              ตอนนี้ทุกคนเท่ากันแล้ว ไม่มีใครต้องโอนใคร
            </p>
          )}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>รายการทั้งหมด ({entries.length})</CardTitle>
        </CardHeader>

        {entries.length === 0 ? (
          <EmptyState
            title="ยังไม่มีรายจ่าย"
            description="พอเริ่มเที่ยวแล้วบันทึกไว้ตรงนี้ ระบบจะคิดให้เองว่าใครต้องคืนใครเท่าไหร่"
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setAdding(true)}>
                  บันทึกรายการแรก
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.id} className="group flex items-center gap-3 rounded-brand px-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-espresso">{entry.title}</p>
                  <p className="text-xs text-muted">
                    {nameOf(entry.paid_by_user_id)} · {CATEGORY_LABELS[entry.category]} ·{' '}
                    {formatRelative(entry.created_at)}
                  </p>
                </div>

                <Badge tone={entry.split_type === 'shared' ? 'info' : 'neutral'}>
                  {entry.split_type === 'shared' ? 'หารกัน' : 'จ่ายเอง'}
                </Badge>

                <span className="shrink-0 text-sm font-medium text-espresso">
                  {formatMoney(entry.amount, entry.currency)}
                </span>

                {canEdit && (entry.paid_by_user_id === me?.id || overview?.my_role === 'owner') ? (
                  <button
                    type="button"
                    aria-label={`ลบ ${entry.title}`}
                    onClick={() => deleteExpense.mutate(entry.id)}
                    className="rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {overview ? (
        <ExpenseForm
          tripId={tripId}
          members={overview.members}
          meId={me?.id}
          open={adding}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
