import { Underline } from '@/components/brand/doodle';
import { cn } from '@/lib/utils';

/**
 * The heading that opens a marketing section.
 *
 * Distinct from `SectionHeader` on purpose. That one is an eyebrow — 11px,
 * letterspaced, muted — and it is right for an app screen, where a section is
 * one more labelled list on a page the reader is already using. On a marketing
 * page the same label has to do a different job: it is the only thing between
 * a stranger and the next block, and at 11px it read as a caption for the
 * cards rather than as the reason to look at them.
 *
 * So this is an H2 at §3's scale, with room for the sentence that makes
 * someone want the section, and an optional scribble under it (§5.2 puts the
 * underline under a section heading, and §5.3 caps a content section at one or
 * two marks — this is usually the one).
 */
export function SectionIntro({
  title,
  lead,
  underline = false,
  className,
}: {
  title: React.ReactNode;
  /** The line that earns the section. Skip it when the title already does. */
  lead?: React.ReactNode;
  underline?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-xl', className)}>
      <div className="relative inline-block">
        <h2 className="t-h2 text-ink text-balance">{title}</h2>
        {underline ? <Underline className="absolute -bottom-2 left-0 h-2 w-full" /> : null}
      </div>
      {lead ? <p className="text-muted t-body mt-3">{lead}</p> : null}
    </div>
  );
}
