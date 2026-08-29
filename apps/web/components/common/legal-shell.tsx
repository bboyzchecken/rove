import Image from 'next/image';
import { TriangleAlert } from 'lucide-react';

import { Underline } from '@/components/brand/doodle';
import { BackHome, PublicShell } from '@/components/common/public-shell';
import { Card } from '@/components/ui/card';

/**
 * Shared shell for the terms and privacy pages.
 *
 * Sections are data rather than markup so both documents stay typographically
 * identical and a lawyer's edits land in one list per page instead of being
 * threaded through JSX.
 */
export interface LegalSection {
  heading: string;
  /** A string is a paragraph; an array of strings is a bullet list. */
  body: (string | string[])[];
}

export function LegalPage({
  image,
  title,
  updated,
  intro,
  sections,
  contact,
}: {
  image: string;
  title: string;
  /** Human-readable, e.g. "19 สิงหาคม 2569". */
  updated: string;
  intro: string;
  sections: LegalSection[];
  contact: React.ReactNode;
}) {
  return (
    <PublicShell actions={<BackHome />}>
      {/* A div, not a <header>: the site header is the one in PublicShell. */}
      <div className="mt-6 flex items-start gap-4">
        <Image
          src={image}
          alt=""
          width={480}
          height={480}
          className="size-20 shrink-0 object-contain"
        />
        <div>
          {/* §5.2 puts the underline scribble under a heading, and a legal
              page gets exactly this one mark — §5.3 caps a calm content
              screen at one or two, and a document should be quieter still. */}
          <div className="relative inline-block">
            <h1 className="t-h2 text-ink">{title}</h1>
            <Underline className="absolute -bottom-1.5 left-0 h-2 w-full" />
          </div>
          <p className="text-muted mt-2.5 text-xs">อัปเดตล่าสุด {updated}</p>
        </div>
      </div>

      {/* This is the part a reader must not miss, so it is not a footnote. */}
      <Card accent="yellow" className="mt-5 p-4">
        <div className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs leading-relaxed">
            <span className="font-medium">ฉบับร่างสำหรับต้นแบบ</span> — เอกสารนี้เขียนไว้ให้เห็นโครง
            ยังไม่ผ่านการตรวจโดยที่ปรึกษากฎหมาย และยังไม่มีผลผูกพันทางกฎหมาย
            ข้อความในวงเล็บเหลี่ยมคือช่องที่ต้องเติมเมื่อจดทะเบียนนิติบุคคลเรียบร้อย
          </p>
        </div>
      </Card>

      <p className="text-muted mt-6 leading-relaxed">{intro}</p>

      <div className="mt-8 space-y-7">
        {sections.map((section, i) => (
          <section key={section.heading}>
            <h2 className="font-display text-ink text-base font-medium">
              <span className="text-primary nums mr-2">{i + 1}.</span>
              {section.heading}
            </h2>

            <div className="mt-2 space-y-2.5">
              {section.body.map((block, j) =>
                Array.isArray(block) ? (
                  <ul key={j} className="space-y-1.5">
                    {block.map((point) => (
                      <li key={point} className="text-muted flex gap-2 text-sm leading-relaxed">
                        <span className="text-primary shrink-0">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p key={j} className="text-muted text-sm leading-relaxed">
                    {block}
                  </p>
                ),
              )}
            </div>
          </section>
        ))}
      </div>

      <Card className="mt-10 p-5">
        <p className="font-display text-ink font-medium">ติดต่อเรา</p>
        <div className="text-muted mt-2 space-y-1 text-sm leading-relaxed">{contact}</div>
      </Card>
    </PublicShell>
  );
}
