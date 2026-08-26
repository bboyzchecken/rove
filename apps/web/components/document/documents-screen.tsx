'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  BedDouble,
  FileText,
  Loader2,
  Plane,
  Shield,
  Ticket,
  Train,
  Trash2,
  Upload,
} from 'lucide-react';

import { SectionHeader } from '@/components/common/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useMe } from '@/features/auth/queries';
import { useDocuments, useRemoveDocument, useUploadDocument } from '@/features/media/queries';
import { useTripMembers } from '@/features/trip/queries';
import type { DocumentCategory, TripDocument } from '@/lib/data';
import { formatBytes } from '@/lib/image';

/**
 * Documents tab (M19 — W19.1): the paper the trip actually runs on. Grouped
 * by what it is for, because at a check-in counter you are not looking for
 * "the file from Tuesday" — you are looking for the hotel voucher.
 */

const CATEGORIES: { id: DocumentCategory; label: string; icon: typeof Ticket }[] = [
  { id: 'ticket', label: 'ตั๋วเครื่องบิน', icon: Plane },
  { id: 'hotel', label: 'ที่พัก', icon: BedDouble },
  { id: 'transport', label: 'เดินทางในประเทศ', icon: Train },
  { id: 'insurance', label: 'ประกัน/วีซ่า', icon: Shield },
  { id: 'other', label: 'อื่นๆ', icon: FileText },
];

/** What the file input accepts — mirrors the API's allowlist (A19.2). */
const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.doc,.docx';

export function DocumentsScreen({ tripId }: { tripId: string }) {
  const { data: documents = [], isLoading } = useDocuments(tripId);
  const { data: members = [] } = useTripMembers(tripId);
  const { data: me } = useMe();

  const upload = useUploadDocument(tripId);
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<TripDocument | null>(null);

  const isOwner = members.find((m) => m.id === me?.id)?.role === 'owner';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-espresso text-sm font-semibold">เอกสารของทริป</p>
          <p className="text-muted mt-0.5 text-xs">ตั๋ว โรงแรม ประกัน — เก็บไว้ที่เดียว ทุกคนในห้องเปิดได้</p>
        </div>
        <Button size="sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
          {upload.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          เพิ่มไฟล์
        </Button>
        <input
          ref={input}
          type="file"
          accept={DOC_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) setPicked(file);
          }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface h-16 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : null}

      {!isLoading && documents.length === 0 ? (
        <Card accent="matcha" className="p-8 text-center">
          <FileText className="text-espresso mx-auto size-8" strokeWidth={2} />
          <p className="text-espresso mt-3 text-sm font-semibold">ยังไม่มีเอกสารในทริปนี้</p>
          <p className="text-muted mx-auto mt-1 max-w-xs text-xs leading-relaxed">
            อัปโหลดตั๋วกับใบจองโรงแรมไว้ตั้งแต่ตอนนี้ — วันเดินทางจะได้ไม่ต้องไล่หาในแชท
          </p>
        </Card>
      ) : null}

      {CATEGORIES.map((category) => {
        const files = documents.filter((d) => d.category === category.id);
        if (files.length === 0) return null;

        return (
          <section key={category.id}>
            <SectionHeader label={`${category.label} · ${files.length} ไฟล์`} />
            <div className="space-y-2">
              {files.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  tripId={tripId}
                  doc={doc}
                  icon={category.icon}
                  canDelete={doc.userId === me?.id || isOwner}
                  onPreview={() => setPreview(doc)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {picked ? (
        <UploadDocumentSheet
          file={picked}
          pending={upload.isPending}
          onClose={() => setPicked(null)}
          onSubmit={(name, category) =>
            upload.mutate({ file: picked, name, category }, { onSuccess: () => setPicked(null) })
          }
        />
      ) : null}

      {preview ? <DocumentPreview doc={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

function DocumentRow({
  tripId,
  doc,
  icon: Icon,
  canDelete,
  onPreview,
}: {
  tripId: string;
  doc: TripDocument;
  icon: typeof Ticket;
  canDelete: boolean;
  onPreview: () => void;
}) {
  const remove = useRemoveDocument(tripId);
  const isImage = doc.contentType.startsWith('image/');

  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="bg-surface flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="text-espresso size-4.5" strokeWidth={2.5} />
      </span>

      <button onClick={onPreview} className="min-w-0 flex-1 text-left">
        <p className="text-espresso line-clamp-1 text-sm font-semibold">{doc.name}</p>
        <p className="text-muted mt-0.5 text-[11px]">
          {isImage ? 'รูปภาพ' : doc.contentType === 'application/pdf' ? 'PDF' : 'เอกสาร'} ·{' '}
          {formatBytes(doc.sizeBytes)}
        </p>
      </button>

      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted hover:text-espresso shrink-0 text-xs font-semibold"
      >
        เปิด
      </a>

      {canDelete ? (
        <button
          onClick={() => remove.mutate(doc.id)}
          disabled={remove.isPending}
          aria-label={`ลบ ${doc.name}`}
          className="text-muted hover:text-espresso shrink-0"
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </Card>
  );
}

/**
 * The upload dialog (W19.2). It opens AFTER the file is picked, because the
 * filename is the only sensible default for the name field and there is no
 * point asking for one before we have it.
 */
function UploadDocumentSheet({
  file,
  pending,
  onClose,
  onSubmit,
}: {
  file: File;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string, category: DocumentCategory) => void;
}) {
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ''));
  const [category, setCategory] = useState<DocumentCategory>('ticket');

  return (
    <Sheet
      open
      onClose={onClose}
      title="เพิ่มเอกสาร"
      description={`${file.name} · ${formatBytes(file.size)}`}
      footer={
        <Button block disabled={pending || !name.trim()} onClick={() => onSubmit(name.trim(), category)}>
          {pending ? 'กำลังอัปโหลด…' : 'อัปโหลด'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อที่จะให้แสดง">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <Field label="หมวด" hint="ใช้จัดกลุ่มในแท็บนี้ เลือกให้ตรงจะหาเจอเร็วตอนอยู่หน้าเคาน์เตอร์">
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as DocumentCategory)}
          >
            {CATEGORIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

/** Images preview inline (W19.3); anything else opens in its own tab. */
function DocumentPreview({ doc, onClose }: { doc: TripDocument; onClose: () => void }) {
  const isImage = doc.contentType.startsWith('image/');

  return (
    <Sheet open onClose={onClose} title={doc.name} className="sm:max-w-lg">
      {isImage && doc.url ? (
        <div className="bg-surface relative aspect-[3/4] overflow-hidden rounded-2xl">
          <Image
            src={doc.url}
            alt={doc.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-contain"
          />
        </div>
      ) : (
        <Card accent="sky" className="p-6 text-center">
          <FileText className="text-espresso mx-auto size-8" strokeWidth={2} />
          <p className="text-espresso mt-3 text-sm font-semibold">
            {doc.contentType === 'application/pdf' ? 'ไฟล์ PDF' : 'ไฟล์เอกสาร'}
          </p>
          <p className="text-muted mt-1 text-xs">{formatBytes(doc.sizeBytes)}</p>
        </Card>
      )}

      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-espresso text-bg font-display mt-4 flex h-11 items-center justify-center rounded-full text-sm font-semibold"
      >
        เปิด / ดาวน์โหลด
      </a>
    </Sheet>
  );
}
