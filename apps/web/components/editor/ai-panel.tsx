'use client';

import { useState } from 'react';
import { Check, Lightbulb, Sparkles, X } from 'lucide-react';

import {
  openQuestions,
  refineOutput,
  useAIJob,
  useAIProgress,
  useApplyDiff,
  useGeneratePlan,
  useRefinePlan,
} from '@/features/ai/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import type { TripEvent } from '@/lib/sse';
import { cn } from '@/lib/utils';
import type { Rationale } from '@/types/api';

/**
 * W4.1 / W4.2 / W4.3 — the AI surface.
 *
 * Generation is a job, so this shows live steps from SSE rather than a spinner:
 * a plan takes tens of seconds, and "กำลังตรวจเวลาเปิด-ปิด" is the difference
 * between waiting and wondering whether it broke.
 */

export function GeneratePanel({
  tripId,
  hasPlan,
  lastEvent,
  canEdit,
}: {
  tripId: string;
  hasPlan: boolean;
  lastEvent: TripEvent | null;
  canEdit: boolean;
}) {
  const [jobId, setJobId] = useState<string>();
  const [hints, setHints] = useState('');
  const [showHints, setShowHints] = useState(false);

  const generate = useGeneratePlan(tripId);
  const progress = useAIProgress(jobId, lastEvent);
  const { data: job } = useAIJob(jobId);

  const running = Boolean(jobId) && progress?.status !== 'done' && progress?.status !== 'error';
  const questions = openQuestions(job);

  if (!canEdit) return null;

  return (
    <Card tone="primary">
      <CardHeader>
        <div>
          <CardTitle>{hasPlan ? 'ร่างแพลนใหม่' : 'ให้ AI ร่างแพลนให้'}</CardTitle>
          <CardDescription>
            อ่านที่อยากไปของทุกคน แล้วจัดเป็นรายวันพร้อมบอกเหตุผลว่าตัดอะไรออกเพราะอะไร
          </CardDescription>
        </div>
      </CardHeader>

      {running && progress ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-espresso">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            {progress.label}…
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-espresso/8">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="text-xs text-muted">ใช้เวลาราว 30-60 วินาที ปิดหน้านี้ไปก่อนก็ได้</p>
        </div>
      ) : (
        <div className="space-y-3">
          {showHints ? (
            <Textarea
              value={hints}
              onChange={(e) => setHints(e.target.value)}
              rows={3}
              placeholder="อยากบอกอะไร AI เพิ่มไหม เช่น วันแรกขอเบา ๆ, ไม่เอาที่คนเยอะ, ขอเวลาช้อปเยอะหน่อย"
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              loading={generate.isPending}
              onClick={async () => {
                const result = await generate.mutateAsync(hints || undefined);
                setJobId(result.job_id);
              }}
            >
              <Sparkles className="h-4 w-4" />
              {hasPlan ? 'ร่างใหม่อีกแบบ' : 'ให้ AI ร่างแพลน'}
            </Button>
            <Button variant="ghost" onClick={() => setShowHints((s) => !s)}>
              {showHints ? 'ซ่อนคำขอเพิ่มเติม' : 'บอกอะไร AI เพิ่ม'}
            </Button>
          </div>
        </div>
      )}

      {progress?.status === 'error' && job?.error ? (
        <p className="mt-3 rounded-brand bg-danger/10 px-3 py-2 text-sm text-danger">
          {job.error}
        </p>
      ) : null}

      {generate.error ? (
        <p className="mt-3 text-sm text-danger">{(generate.error as Error).message}</p>
      ) : null}

      {questions.length > 0 ? (
        <div className="mt-4 rounded-brand bg-surface/70 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-espresso">
            <Lightbulb className="h-4 w-4 text-primary" />
            AI อยากให้กลุ่มตัดสินใจเรื่องนี้
          </p>
          <ul className="space-y-1.5">
            {questions.map((question, i) => (
              <li key={i} className="text-sm text-muted">
                • {question}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            ตอบได้ในช่อง “ขอปรับแพลน” ด้านล่าง หรือคุยกันในแท็บคุยกัน
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/** W4.2 — the rationale panel: why the plan looks the way it does. */
export function RationalePanel({ rationales }: { rationales: Rationale[] }) {
  if (rationales.length === 0) return null;

  const kinds: Record<Rationale['kind'], { label: string; tone: 'neutral' | 'warning' | 'danger' }> = {
    chosen: { label: 'เลือกเพราะ', tone: 'neutral' },
    added: { label: 'เพิ่มให้', tone: 'neutral' },
    moved: { label: 'ย้ายเพราะ', tone: 'neutral' },
    cut: { label: 'ตัดออกเพราะ', tone: 'warning' },
    warning: { label: 'ระวัง', tone: 'danger' },
  };

  // Cuts and warnings first — those are the decisions someone might dispute.
  const order: Rationale['kind'][] = ['warning', 'cut', 'moved', 'chosen', 'added'];
  const sorted = [...rationales].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>ทำไมแพลนถึงออกมาแบบนี้</CardTitle>
      </CardHeader>
      <ul className="space-y-2">
        {sorted.map((rationale) => {
          const config = kinds[rationale.kind] ?? kinds.chosen;
          return (
            <li key={rationale.id} className="flex items-start gap-2">
              <Badge tone={config.tone}>{config.label}</Badge>
              <span className="text-sm text-muted">{rationale.text}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * W4.3 — refine chat plus the diff preview.
 *
 * The model returns a patch, never a whole plan, and nothing is applied until
 * the group ticks it. That is the difference between a tool and a slot machine.
 */
export function RefinePanel({
  tripId,
  planId,
  lastEvent,
  canEdit,
}: {
  tripId: string;
  planId: string;
  lastEvent: TripEvent | null;
  canEdit: boolean;
}) {
  const [instruction, setInstruction] = useState('');
  const [jobId, setJobId] = useState<string>();
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  const refine = useRefinePlan(planId);
  const applyDiff = useApplyDiff(tripId, planId);
  const progress = useAIProgress(jobId, lastEvent);
  const { data: job } = useAIJob(jobId);

  const output = refineOutput(job);
  const running = Boolean(jobId) && progress?.status !== 'done' && progress?.status !== 'error';

  if (!canEdit) return null;

  function reset() {
    setJobId(undefined);
    setRejected(new Set());
    setInstruction('');
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>ขอปรับแพลน</CardTitle>
          <CardDescription>บอกเป็นภาษาคนได้เลย แล้วเลือกรับทีละข้อ</CardDescription>
        </div>
      </CardHeader>

      {output ? (
        <div className="space-y-3">
          {output.summary ? (
            <p className="rounded-brand bg-sky/25 px-3 py-2 text-sm text-espresso">
              {output.summary}
            </p>
          ) : null}

          {output.diffs.length === 0 ? (
            <p className="text-sm text-muted">AI ไม่ได้เสนอการเปลี่ยนแปลงอะไร</p>
          ) : (
            <ul className="space-y-2">
              {output.diffs.map((diff, index) => {
                const isRejected = rejected.has(index);
                return (
                  <li
                    key={index}
                    className={cn(
                      'flex items-start gap-3 rounded-brand p-3',
                      isRejected ? 'bg-espresso/4 opacity-50' : 'bg-matcha/20',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-espresso">
                        {opLabel(diff.op)} · วันที่ {diff.day_index + 1}
                        {typeof diff.item.title === 'string' ? ` · ${diff.item.title}` : ''}
                      </p>
                      <p className="text-sm text-muted">{diff.reason}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={isRejected ? 'รับข้อนี้' : 'ไม่เอาข้อนี้'}
                      onClick={() =>
                        setRejected((prev) => {
                          const next = new Set(prev);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                      className="shrink-0 rounded-full p-1.5 text-muted hover:bg-surface"
                    >
                      {isRejected ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              loading={applyDiff.isPending}
              disabled={output.diffs.length === rejected.size}
              onClick={() =>
                applyDiff.mutate(
                  {
                    jobId: jobId!,
                    accepted: output.diffs
                      .map((_, i) => i)
                      .filter((i) => !rejected.has(i)),
                  },
                  { onSuccess: reset },
                )
              }
            >
              รับที่เลือกไว้ ({output.diffs.length - rejected.size})
            </Button>
            <Button variant="ghost" onClick={reset}>
              ไม่เอาทั้งหมด
            </Button>
          </div>
        </div>
      ) : running ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          {progress?.label}…
        </p>
      ) : (
        <div className="space-y-3">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="เช่น วันที่ 3 แน่นไป ตัดออกสักที่, ขอเพิ่มร้านราเมงวันสุดท้าย, ย้ายดิสนีย์ไปวันธรรมดา"
          />
          <Button
            loading={refine.isPending}
            disabled={instruction.trim().length < 5}
            onClick={async () => {
              const result = await refine.mutateAsync(instruction);
              setJobId(result.job_id);
            }}
          >
            <Sparkles className="h-4 w-4" />
            ขอให้ปรับ
          </Button>
          {refine.error ? (
            <p className="text-sm text-danger">{(refine.error as Error).message}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function opLabel(op: string): string {
  return (
    { add: 'เพิ่ม', update: 'แก้', move: 'ย้าย', remove: 'ลบ' }[op] ?? op
  );
}
