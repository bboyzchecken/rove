import Image from 'next/image';

import { BackHome, PublicShell } from '@/components/common/public-shell';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * The shared shell for every dead end: 404, a crashed render, the API being
 * down. All three are the same shape — say what happened in plain words, then
 * give the one action that actually helps (§15 Tone of Voice: บอกตรงๆ ว่าผิด
 * อะไร + ทำอะไรต่อได้, ไม่ขอโทษซ้ำซ้อน).
 */
export function StatusPage({
  image,
  code,
  tone = 'neutral',
  title,
  hint,
  actions,
  detail,
}: {
  image: string;
  /** HTTP-ish code shown as a chip — omit for states that have no code. */
  code?: string;
  tone?: 'neutral' | 'primary' | 'sun';
  title: string;
  hint: React.ReactNode;
  actions?: React.ReactNode;
  /** Technical line for whoever has to fix it. Never the only message. */
  detail?: React.ReactNode;
}) {
  return (
    <PublicShell width="focused" center actions={<BackHome />}>
      <div className="flex flex-col items-center py-10 text-center">
        <Image
          src={image}
          alt=""
          width={480}
          height={480}
          priority
          className="mb-4 size-52 object-contain"
        />

        {code ? (
          <Badge tone={tone} size="md" className="nums mb-3">
            {code}
          </Badge>
        ) : null}

        <h1 className="font-display text-espresso text-2xl font-extrabold tracking-tight text-balance">
          {title}
        </h1>
        <p className="text-muted mt-2 text-sm leading-relaxed">{hint}</p>

        {actions ? <div className={cn('mt-6 flex w-full flex-col gap-2')}>{actions}</div> : null}

        {detail ? (
          <p className="text-muted/70 bg-surface rounded-brand-sm mt-6 w-full px-3 py-2 text-left text-[11px] leading-relaxed break-words">
            {detail}
          </p>
        ) : null}
      </div>
    </PublicShell>
  );
}
