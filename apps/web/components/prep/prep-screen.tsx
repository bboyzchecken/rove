'use client';

import { useState } from 'react';
import { Check, ListChecks, Plus, Trash2 } from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CharacterAvatar } from '@/components/ui/character-avatar';
import { FieldLabel, Input, Textarea, fieldClass } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import {
  useAddPrepTask,
  useApplyPrepTemplate,
  usePrepNote,
  usePrepTasks,
  useRemovePrepTask,
  useSavePrepNote,
  useTogglePrepTask,
} from '@/features/prep/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { PrepCategory } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Prep tab (M8 — W8.1 shared checklist).
 *
 * Ticking is optimistic because four people tick this list at the same time in
 * a group chat; waiting for a round trip would make it feel broken.
 */
const CATEGORY_META: Record<
  PrepCategory,
  { label: string; tone: 'primary' | 'blue' | 'green' | 'yellow' | 'pink' | 'neutral' }
> = {
  document: { label: 'เอกสาร', tone: 'primary' },
  packing: { label: 'ของที่ต้องเอาไป', tone: 'blue' },
  booking: { label: 'ต้องจอง', tone: 'green' },
  money: { label: 'เรื่องเงิน', tone: 'yellow' },
  health: { label: 'สุขภาพ', tone: 'pink' },
  other: { label: 'อื่นๆ', tone: 'neutral' },
};

export function PrepScreen({ tripId }: { tripId: string }) {
  const { data: tasks = [], isLoading } = usePrepTasks(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const toggle = useTogglePrepTask(tripId);
  const remove = useRemovePrepTask(tripId);
  const applyTemplate = useApplyPrepTemplate(tripId);

  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<PrepCategory | 'all'>('all');

  const done = tasks.filter((t) => t.done).length;
  const visible = tasks.filter((t) => filter === 'all' || t.category === filter);
  const categories = [...new Set(tasks.map((t) => t.category))];

  if (isLoading) {
    return <div className="rounded-brand bg-surface h-64 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      {tasks.length === 0 ? (
        <>
          <EmptyState
            image="/brand/empty/empty-members.webp"
            title="ยังไม่มีเช็กลิสต์"
            hint="ดึงรายการมาตรฐานสำหรับทริปญี่ปุ่นมาก่อน แล้วค่อยเพิ่มของตัวเอง"
          />
          <Button
            block
            size="lg"
            onClick={() => applyTemplate.mutate()}
            disabled={applyTemplate.isPending}
          >
            <ListChecks className="size-4" />
            {applyTemplate.isPending ? 'กำลังดึง…' : 'ดึงเช็กลิสต์มาตรฐาน'}
          </Button>
        </>
      ) : (
        <>
          <Card accent="green" className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-ink font-bold">เตรียมตัวไปแล้ว</p>
              <span className="text-muted nums text-xs font-medium">
                {done}/{tasks.length}
              </span>
            </div>
            <Progress value={tasks.length === 0 ? 0 : done / tasks.length} tone="ink" />
            <p className="text-muted mt-2 text-xs">
              {done === tasks.length
                ? 'ครบแล้วทุกข้อ — พร้อมบินได้เลย'
                : `เหลืออีก ${tasks.length - done} ข้อ`}
            </p>
          </Card>

          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              ทั้งหมด
            </FilterChip>
            {categories.map((category) => (
              <FilterChip
                key={category}
                active={filter === category}
                onClick={() => setFilter(category)}
              >
                {CATEGORY_META[category].label}
              </FilterChip>
            ))}
          </div>

          <section>
            <SectionHeader
              label={`${visible.length} รายการ`}
              action={
                <button
                  onClick={() => applyTemplate.mutate()}
                  className="text-primary text-xs font-medium"
                >
                  เติมรายการมาตรฐาน
                </button>
              }
            />
            <Card className="divide-border divide-y">
              {visible.map((task) => {
                const assignee = members.find((m) => m.id === task.assigneeId);
                return (
                  <div key={task.id} className="flex items-center gap-3 p-3.5">
                    <button
                      aria-label={task.done ? `ยกเลิก ${task.title}` : `ทำแล้ว ${task.title}`}
                      onClick={() => toggle.mutate({ taskId: task.id, done: !task.done })}
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full transition',
                        task.done
                          ? 'bg-ink text-bg'
                          : 'border-muted/30 border-2 border-dashed',
                      )}
                    >
                      {task.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm',
                          task.done ? 'text-muted line-through' : 'text-ink font-medium',
                        )}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={CATEGORY_META[task.category].tone}>
                          {CATEGORY_META[task.category].label}
                        </Badge>
                        {assignee ? (
                          <span className="text-muted flex items-center gap-1 text-[11px]">
                            <CharacterAvatar characterId={assignee.characterId} size="xs" />
                            {assignee.name}
                          </span>
                        ) : (
                          <span className="text-muted text-[11px]">ทั้งกลุ่ม</span>
                        )}
                      </div>
                    </div>

                    <button
                      aria-label={`ลบ ${task.title}`}
                      onClick={() => remove.mutate(task.id)}
                      className="text-muted hover:text-danger flex size-8 shrink-0 items-center justify-center rounded-full"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </Card>
          </section>

          <Button variant="outline" block size="lg" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> เพิ่มสิ่งที่ต้องเตรียม
          </Button>
        </>
      )}

      <PrepNoteBlock tripId={tripId} />

      <AddPrepSheet tripId={tripId} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/**
 * The trip's shared scratchpad (W8.2): addresses, confirmation numbers, what to
 * pack. Deliberately one plain text block rather than another list — the things
 * that end up here are exactly the things that do not fit a checklist.
 */
function PrepNoteBlock({ tripId }: { tripId: string }) {
  const { data: note = '' } = usePrepNote(tripId);
  const saveNote = useSavePrepNote(tripId);
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? note;
  const dirty = draft !== null && draft !== note;

  return (
    <section>
      <SectionHeader
        label="โน้ตของกลุ่ม"
        action={
          dirty ? (
            <button
              onClick={async () => {
                await saveNote.mutateAsync(value);
                setDraft(null);
              }}
              className="text-primary text-xs font-medium"
            >
              {saveNote.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          ) : null
        }
      />
      <Textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        placeholder="ที่อยู่โรงแรม เลขที่จอง เบอร์ติดต่อฉุกเฉิน — อะไรที่ไม่เข้าเช็กลิสต์ก็ใส่ตรงนี้"
        className={cn(fieldClass, 'leading-relaxed')}
      />
      <p className="text-muted mt-1.5 text-[11px]">ทุกคนในห้องแก้ได้ และเห็นตรงกัน</p>
    </section>
  );
}

function AddPrepSheet({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: members = [] } = useTripMembers(tripId);
  const addTask = useAddPrepTask(tripId);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PrepCategory>('other');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return;
    await addTask.mutateAsync({ title: title.trim(), category, assigneeId });
    setTitle('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="เพิ่มสิ่งที่ต้องเตรียม"
      description="มอบหมายให้ใครก็ได้ หรือปล่อยเป็นของทั้งกลุ่ม"
      footer={
        <Button
          block
          size="lg"
          onClick={() => void save()}
          disabled={addTask.isPending || !title.trim()}
        >
          {addTask.isPending ? 'กำลังเพิ่ม…' : 'เพิ่มลงเช็กลิสต์'}
        </Button>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <FieldLabel>ต้องเตรียมอะไร</FieldLabel>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ซื้อ eSIM"
          />
        </label>

        <div>
          <FieldLabel>หมวด</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CATEGORY_META) as PrepCategory[]).map((option) => (
              <button
                key={option}
                onClick={() => setCategory(option)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition',
                  category === option ? 'bg-ink text-bg' : 'bg-surface text-muted',
                )}
              >
                {CATEGORY_META[option].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>ใครรับผิดชอบ</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setAssigneeId(null)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition',
                assigneeId === null ? 'bg-ink text-bg' : 'bg-surface text-muted',
              )}
            >
              ทั้งกลุ่ม
            </button>
            {members.map((member) => (
              <button
                key={member.id}
                onClick={() => setAssigneeId(member.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-medium transition',
                  assigneeId === member.id ? 'bg-ink text-bg' : 'bg-surface text-muted',
                )}
              >
                <CharacterAvatar characterId={member.characterId} size="xs" />
                {member.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition',
        active ? 'bg-ink text-bg' : 'bg-surface text-muted hover:bg-border',
      )}
    >
      {children}
    </button>
  );
}
