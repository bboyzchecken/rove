'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coins, ExternalLink, Plus, Sparkles, Trash2 } from 'lucide-react';

import { useMe } from '@/features/auth/queries';
import {
  useCreateDream,
  useDeleteDream,
  useDreams,
  usePoints,
  usePointsHistory,
  useUpdateMe,
} from '@/features/user/queries';
import { CharacterPicker } from '@/components/common/character-picker';
import { SiteHeader } from '@/components/common/site-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { EmptyState, SkeletonList } from '@/components/ui/states';
import { track } from '@/lib/analytics';
import { formatNumber, formatRelative } from '@/lib/format';

/** M15 + the profile: your character, your dream list, your points. */
export default function ProfilePage() {
  const [addingDream, setAddingDream] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const { data: me, isLoading } = useMe();
  const { data: dreams } = useDreams();
  const { data: points } = usePoints();
  const { data: history } = usePointsHistory();
  const deleteDream = useDeleteDream();

  useEffect(() => {
    track({ name: 'points_balance_viewed' });
  }, []);

  if (isLoading) return <SkeletonList rows={4} />;
  if (!me) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <EmptyState title="เข้าสู่ระบบก่อนนะ" />
        </main>
      </>
    );
  }

  const items = dreams?.items ?? [];

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16 pt-5">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar
              name={me.display_name}
              avatarUrl={me.avatar_url}
              characterId={me.character_id}
              size="xl"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl">{me.display_name}</h1>
              <p className="text-sm text-muted">{me.handle ? `@${me.handle}` : me.email ?? ''}</p>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="mt-1 text-sm text-primary hover:underline"
              >
                แก้ชื่อที่แสดง
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>ตัวละครของคุณ</CardTitle>
              <CardDescription>เพื่อน ๆ เห็นตัวนี้แทนรูปโปรไฟล์ในห้องทริป</CardDescription>
            </div>
          </CardHeader>
          <CharacterPicker currentId={me.character_id} />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>ที่ยังอยากไป ({items.length})</CardTitle>
              <CardDescription>เก็บไว้ก่อน แล้วเริ่มแพลนเมื่อพร้อม</CardDescription>
            </div>
            <Button variant="soft" size="sm" onClick={() => setAddingDream(true)}>
              <Plus className="h-4 w-4" />
              เพิ่ม
            </Button>
          </CardHeader>

          {items.length === 0 ? (
            <EmptyState
              title="ลิสต์ยังว่าง"
              description="เห็นที่ไหนน่าไปในฟีดก็เก็บมาไว้ที่นี่ได้เลย"
            />
          ) : (
            <ul className="space-y-2">
              {items.map((dream) => (
                <li
                  key={dream.id}
                  className="group flex items-start gap-3 rounded-brand bg-espresso/4 p-3"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-espresso">{dream.title}</p>
                    {dream.destination_city || dream.destination_country ? (
                      <p className="text-xs text-muted">
                        {[dream.destination_city, dream.destination_country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    ) : null}
                    {dream.notes ? (
                      <p className="mt-1 text-sm text-muted">{dream.notes}</p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {/* W15.3 — the dream becomes a trip in one tap, with the
                          city already filled in. */}
                      <Link
                        href={`/?city=${encodeURIComponent(dream.destination_city || '')}`}
                        className="text-primary hover:underline"
                      >
                        เริ่มแพลนทริปนี้
                      </Link>
                      {dream.url ? (
                        <a
                          href={dream.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-muted hover:text-espresso"
                        >
                          <ExternalLink className="h-3 w-3" />
                          ลิงก์ที่เก็บไว้
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={`ลบ ${dream.title}`}
                    onClick={() => deleteDream.mutate(dream.id)}
                    className="rounded p-1 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card tone="sun">
          <CardHeader>
            <div>
              <CardTitle>แต้ม ROVE</CardTitle>
              <CardDescription>
                {points?.can_redeem
                  ? 'ใช้เป็นส่วนลดตอนจองได้แล้ว'
                  : `สะสมให้ถึง ${formatNumber(points?.min_redeem_balance ?? 100)} แต้มถึงจะใช้ได้`}
              </CardDescription>
            </div>
            <Coins className="h-5 w-5 shrink-0 text-espresso/60" />
          </CardHeader>

          <p className="font-display text-3xl font-bold text-espresso">
            {formatNumber(points?.balance ?? 0)}
          </p>

          {history && history.items.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {history.items.slice(0, 5).map((tx) => (
                <li key={tx.id} className="flex items-center gap-2 text-sm">
                  <span className="text-espresso/70">{tx.note || tx.type}</span>
                  <span className="ml-auto font-medium text-espresso">
                    {tx.amount > 0 ? '+' : ''}
                    {formatNumber(tx.amount)}
                  </span>
                  <span className="text-xs text-espresso/50">{formatRelative(tx.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-espresso/70">
              เปิดทริปเป็นสาธารณะ แล้วถ้ามีคนก๊อปไปจองผ่านลิงก์ คุณจะได้แต้ม
            </p>
          )}
        </Card>

        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="ghost" full className="text-muted">
            ออกจากระบบ
          </Button>
        </form>
      </main>

      <AddDreamDialog open={addingDream} onClose={() => setAddingDream(false)} />
      <EditNameDialog
        open={editingName}
        onClose={() => setEditingName(false)}
        currentName={me.display_name}
      />
    </>
  );
}

/** W15.2 — the add-dream dialog. */
function AddDreamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  const createDream = useCreateDream();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เพิ่มที่อยากไป"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={createDream.isPending}
            disabled={!title.trim()}
            onClick={() =>
              createDream.mutate(
                {
                  title: title.trim(),
                  destination_city: city,
                  destination_country: country,
                  url: url || undefined,
                  notes,
                },
                {
                  onSuccess: () => {
                    setTitle('');
                    setCity('');
                    setCountry('');
                    setUrl('');
                    setNotes('');
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
        <Field label="อยากไปไหน">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ดูใบไม้เปลี่ยนสีที่เกียวโต"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="เมือง">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="ประเทศ">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
        </div>
        <Field label="ลิงก์ที่เจอมา" hint="ข้ามได้ — เผื่อเก็บโพสต์หรือรีวิวที่ทำให้อยากไป">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>
        <Field label="โน้ต">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Dialog>
  );
}

function EditNameDialog({
  open,
  onClose,
  currentName,
}: {
  open: boolean;
  onClose: () => void;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const updateMe = useUpdateMe();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ชื่อที่แสดง"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={updateMe.isPending}
            disabled={!name.trim()}
            onClick={() =>
              updateMe.mutate({ display_name: name.trim() }, { onSuccess: onClose })
            }
          >
            บันทึก
          </Button>
        </>
      }
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="ชื่อที่แสดง" />
    </Dialog>
  );
}
