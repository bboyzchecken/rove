'use client';

import { use, useState } from 'react';
import { CloudSun, FileText, Info, Luggage, Plus, RefreshCw } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import {
  useCreatePrepBlock,
  usePrep,
  useRegeneratePrep,
  useToggleChecklist,
} from '@/features/prep/queries';
import { useTripOverview } from '@/features/trip/queries';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { ErrorState, SkeletonList } from '@/components/ui/states';
import type { ChecklistEntry, MemberView, PrepBlock } from '@/types/api';

/**
 * M8 — the Prep tab.
 *
 * Checklists are shared, and ticking is optimistic: this is a thing two people
 * do at once the night before, so it has to feel instant and it has to show who
 * already did what.
 */

const BLOCK_ICONS: Record<PrepBlock['type'], typeof Luggage> = {
  weather: CloudSun,
  packing: Luggage,
  docs: FileText,
  rule: Info,
  custom: FileText,
};

export default function PrepPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [adding, setAdding] = useState(false);

  const { data: me } = useMe();
  const { data: overview } = useTripOverview(tripId);
  const { data, isLoading, error, refetch } = usePrep(tripId);
  const regenerate = useRegeneratePrep(tripId);

  if (isLoading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState onRetry={() => void refetch()} />;

  const blocks = data?.items ?? [];
  const canEdit = overview ? overview.my_role !== 'viewer' : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">เตรียมตัวก่อนไป</h2>
          <p className="text-sm text-muted">ติ๊กร่วมกันได้ทั้งกลุ่ม ใครทำแล้วคนอื่นเห็น</p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="สร้างใหม่จากแพลนล่าสุด"
              loading={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              เพิ่มโน้ต
            </Button>
          </div>
        ) : null}
      </div>

      {blocks.map((block) => (
        <PrepCard
          key={block.id}
          tripId={tripId}
          block={block}
          members={overview?.members ?? []}
          meId={me?.id}
          canEdit={canEdit}
        />
      ))}

      <CustomBlockDialog tripId={tripId} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function PrepCard({
  tripId,
  block,
  members,
  meId,
  canEdit,
}: {
  tripId: string;
  block: PrepBlock;
  members: MemberView[];
  meId?: string;
  canEdit: boolean;
}) {
  const toggle = useToggleChecklist(tripId);
  const Icon = BLOCK_ICONS[block.type] ?? FileText;
  const checklist = block.checklist ?? [];

  const done = checklist.filter((entry) => entry.done).length;

  function toggleEntry(entry: ChecklistEntry) {
    const next = checklist.map((e) =>
      e.id === entry.id ? { ...e, done: !e.done, done_by: !e.done ? meId : undefined } : e,
    );
    toggle.mutate({ blockId: block.id, checklist: next });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <CardTitle>{block.title}</CardTitle>
        </div>
        {checklist.length > 0 ? (
          <span className="shrink-0 text-xs text-muted">
            {done}/{checklist.length}
          </span>
        ) : null}
      </CardHeader>

      {block.content_md ? (
        <div className="mb-3 space-y-1 text-sm text-muted">
          {block.content_md.split('\n').map((line, i) => (
            <p key={i} className={line.startsWith('|') ? 'font-mono text-xs' : ''}>
              {line.replace(/^-\s*/, '• ').replace(/\*\*/g, '')}
            </p>
          ))}
        </div>
      ) : null}

      {checklist.length > 0 ? (
        <ul className="space-y-0.5">
          {checklist.map((entry) => {
            const doneBy = entry.done_by ? members.find((m) => m.user_id === entry.done_by) : null;
            return (
              <li key={entry.id}>
                <label className="flex items-center gap-2.5 rounded-brand px-1 py-1.5 hover:bg-espresso/4">
                  <input
                    type="checkbox"
                    checked={entry.done}
                    disabled={!canEdit}
                    onChange={() => toggleEntry(entry)}
                    className="h-4 w-4 shrink-0 rounded accent-[hsl(var(--brand-primary))]"
                  />
                  <span
                    className={
                      entry.done ? 'flex-1 text-sm text-muted line-through' : 'flex-1 text-sm text-espresso'
                    }
                  >
                    {entry.label}
                  </span>
                  {doneBy ? (
                    <Avatar
                      name={doneBy.display_name}
                      avatarUrl={doneBy.avatar_url}
                      characterId={doneBy.character_id}
                      size="sm"
                    />
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

/** W8.2 — a custom block, safe from regenerate. */
function CustomBlockDialog({
  tripId,
  open,
  onClose,
}: {
  tripId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const createBlock = useCreatePrepBlock(tripId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เพิ่มโน้ตของกลุ่ม"
      description="โน้ตที่เขียนเองจะไม่หายตอนกดสร้างใหม่"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={createBlock.isPending}
            disabled={!title.trim()}
            onClick={() =>
              createBlock.mutate(
                { title: title.trim(), content_md: content },
                {
                  onSuccess: () => {
                    setTitle('');
                    setContent('');
                    onClose();
                  },
                },
              )
            }
          >
            เพิ่ม
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="หัวข้อ">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ของที่ต้องซื้อฝากใคร"
          />
        </Field>
        <Field label="รายละเอียด">
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} />
        </Field>
      </div>
    </Dialog>
  );
}
