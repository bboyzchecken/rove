'use client';

import { use, useState } from 'react';
import { AlertTriangle, History, List, Lock, Plus } from 'lucide-react';

import { useCreateItem, useCreatePlan, useFreezePlan, usePlan, usePlans, useSnapshotPlan, useUndoItem } from '@/features/plan/queries';
import { useTripOverview } from '@/features/trip/queries';
import { GeneratePanel, RationalePanel, RefinePanel } from '@/components/editor/ai-panel';
import { ItemSheet, UndoBanner } from '@/components/editor/item-sheet';
import { Timeline } from '@/components/editor/timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/states';
import { formatTokyoDate } from '@/lib/format';
import { useTripEvents } from '@/lib/sse';
import { useEditorStore } from '@/stores/editor-store';
import { cn } from '@/lib/utils';
import type { Item } from '@/types/api';

/** M4 + M5 — the plan tab: AI generation, the timeline editor, the rationale. */
export default function PlanPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);

  const dayIndex = useEditorStore((state) => state.activeDayIndex);
  const setDayIndex = useEditorStore((state) => state.setActiveDay);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deletedItemId, setDeletedItemId] = useState<string | null>(null);
  const [listView, setListView] = useState(false);

  const { lastEvent } = useTripEvents(tripId);
  const { data: overview } = useTripOverview(tripId);
  const { data: plans, isLoading: plansLoading } = usePlans(tripId);

  const activePlan = plans?.items.find((p) => p.is_final) ?? plans?.items[0];
  const { data: plan, isLoading, error, refetch } = usePlan(activePlan?.id);

  const createPlan = useCreatePlan(tripId);
  const freezePlan = useFreezePlan(tripId);
  const snapshot = useSnapshotPlan();
  const createItem = useCreateItem(tripId, activePlan?.id ?? '');
  const undoItem = useUndoItem(tripId, activePlan?.id ?? '');

  const canEdit = overview ? overview.my_role !== 'viewer' : false;

  if (plansLoading) return <SkeletonList rows={3} />;

  if (!activePlan) {
    return (
      <div className="space-y-4">
        <GeneratePanel tripId={tripId} hasPlan={false} lastEvent={lastEvent} canEdit={canEdit} />
        <EmptyState
          title="ยังไม่มีแพลน"
          description="กดให้ AI ร่างให้ หรือจะสร้างแพลนเปล่าแล้วใส่เองก็ได้"
          action={
            canEdit ? (
              <Button
                variant="outline"
                loading={createPlan.isPending}
                onClick={() => createPlan.mutate(undefined)}
              >
                <Plus className="h-4 w-4" />
                สร้างแพลนเปล่า
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (isLoading) return <SkeletonList rows={4} />;
  if (error || !plan) return <ErrorState onRetry={() => void refetch()} />;

  const day = plan.days[Math.min(dayIndex, plan.days.length - 1)];
  const errors = plan.warnings.filter((w) => w.severity === 'error');

  function addItem() {
    if (!day) return;
    createItem.mutate(
      { title: 'รายการใหม่', day_id: day.id, type: 'place' },
      { onSuccess: (created) => setEditing(created) },
    );
  }

  return (
    <div className="space-y-4">
      <GeneratePanel tripId={tripId} hasPlan lastEvent={lastEvent} canEdit={canEdit} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{plan.plan.name}</CardTitle>
            {plan.plan.key_decision ? (
              <p className="mt-0.5 text-sm text-muted">{plan.plan.key_decision}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={listView ? 'ดูแบบไทม์ไลน์' : 'ดูแบบรายการ'}
              onClick={() => setListView((v) => !v)}
            >
              <List className="h-4 w-4" />
            </Button>
            {canEdit ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="บันทึกเวอร์ชัน"
                loading={snapshot.isPending}
                onClick={() => snapshot.mutate(plan.plan.id)}
              >
                <History className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </CardHeader>

        {plan.plan.summary ? (
          <p className="mb-3 text-sm text-muted">{plan.plan.summary}</p>
        ) : null}

        {/* W5.8 — errors surface above the timeline, because a closed museum on
            day three is not something to discover by scrolling. */}
        {errors.length > 0 ? (
          <div className="mb-3 rounded-brand bg-danger/8 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlertTriangle className="h-4 w-4" />
              ต้องแก้ {errors.length} จุด
            </p>
            <ul className="space-y-1">
              {errors.map((issue, i) => (
                <li key={i} className="text-sm text-muted">
                  • {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {overview?.my_role === 'owner' && !plan.plan.is_final ? (
            <Button
              variant="outline"
              size="sm"
              loading={freezePlan.isPending}
              onClick={() => freezePlan.mutate(plan.plan.id)}
            >
              <Lock className="h-4 w-4" />
              ล็อกเป็นแพลนตัวจริง
            </Button>
          ) : null}
          {plan.plan.is_final ? <Badge tone="success">แพลนตัวจริง</Badge> : null}
          {plan.plan.created_by === 'ai' ? <Badge tone="info">ร่างโดย AI</Badge> : null}
        </div>
      </Card>

      {listView ? (
        <ListView plan={plan} />
      ) : (
        <>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {plan.days.map((d, i) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={i === dayIndex}
                onClick={() => setDayIndex(i)}
                className={cn(
                  'shrink-0 rounded-brand px-3 py-2 text-left transition-colors',
                  i === dayIndex ? 'bg-espresso text-white' : 'bg-surface text-muted',
                )}
              >
                <span className="block text-xs opacity-70">วันที่ {i + 1}</span>
                <span className="block text-sm font-medium">{formatTokyoDate(d.date)}</span>
              </button>
            ))}
          </div>

          {day ? (
            <div>
              {day.title || day.theme ? (
                <p className="mb-2 text-sm text-muted">
                  {day.title}
                  {day.theme ? <span className="ml-1.5 text-xs">({day.theme})</span> : null}
                </p>
              ) : null}

              <Timeline
                tripId={tripId}
                planId={plan.plan.id}
                day={day}
                pois={plan.pois}
                issues={plan.warnings}
                canEdit={canEdit}
                onEditItem={setEditing}
                onAddItem={addItem}
              />
            </div>
          ) : null}
        </>
      )}

      <RationalePanel rationales={plan.rationales} />

      <RefinePanel
        tripId={tripId}
        planId={plan.plan.id}
        lastEvent={lastEvent}
        canEdit={canEdit}
      />

      <ItemSheet
        tripId={tripId}
        planId={plan.plan.id}
        item={editing}
        poi={editing?.poi_id ? plan.pois[editing.poi_id] : undefined}
        canEdit={canEdit}
        onClose={() => setEditing(null)}
        onDeleted={setDeletedItemId}
      />

      {deletedItemId ? (
        <UndoBanner
          itemId={deletedItemId}
          onUndo={(id) => {
            undoItem.mutate(id);
            setDeletedItemId(null);
          }}
          onDismiss={() => setDeletedItemId(null)}
        />
      ) : null}
    </div>
  );
}

/** W5.6 — the print-friendly list: every day at once, no interaction. */
function ListView({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>['data']> }) {
  return (
    <div className="space-y-5 print:space-y-3">
      {plan.days.map((day, i) => (
        <section key={day.id}>
          <h3 className="mb-2 border-b border-border pb-1 font-display text-sm">
            วันที่ {i + 1} · {formatTokyoDate(day.date)}
            {day.title ? ` · ${day.title}` : ''}
          </h3>
          <ul className="space-y-1.5">
            {day.items.map((item) => (
              <li key={item.id} className="flex gap-3 text-sm">
                <span className="w-14 shrink-0 font-mono text-xs text-muted">
                  {item.start_time || '—'}
                </span>
                <span className="text-espresso">
                  {item.title}
                  {item.notes ? (
                    <span className="block text-xs text-muted">{item.notes}</span>
                  ) : null}
                </span>
              </li>
            ))}
            {day.items.length === 0 ? (
              <li className="text-sm text-muted">ยังไม่มีรายการ</li>
            ) : null}
          </ul>
        </section>
      ))}
    </div>
  );
}
