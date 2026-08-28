import Image from 'next/image';

import { COVER_HEIGHT, COVER_WIDTH } from '@/lib/covers';
import { cn } from '@/lib/utils';

/**
 * One trip cover, framed the same way everywhere it appears.
 *
 * Every surface used to crop the same picture to its own box — a 7:1 band in
 * the room header, a square in the trip list, a letterbox on the home card —
 * so one cover showed up as four different pictures, and a wide crop turned a
 * cable car into wallpaper. The rule now: the artwork is 3:2 (§15, and
 * `lib/image.ts` crops uploads to match), it is never cropped again, and the
 * space a frame has left over is the colour block behind it.
 *
 * `frame` therefore chooses how much room the cover gets, not what shape it is
 * cut to. Overlays — a badge, the change-cover button — go in as children.
 */
const FRAME = {
  /**
   * Room header, next-trip card, public view, recap: a band as wide as the
   * column, with the cover standing 3:2 in the middle of it. The band is what
   * gives a masthead its width; the height is what decides how big the picture
   * is, since the picture is 1.5x whatever height it is given — h-56 is what
   * makes it reach both edges of a phone.
   */
  banner: 'h-56 sm:h-64',
  /** A card that is as wide as its column. */
  card: 'aspect-[3/2] w-full',
  /** Beside a row in the trip list. */
  thumb: 'aspect-[3/2] w-32 shrink-0 sm:w-36',
  /** Small enough to sit beside a single line of text. */
  mini: 'aspect-[3/2] w-16 shrink-0',
} as const;

export function TripCover({
  src,
  frame = 'card',
  priority,
  className,
  children,
}: {
  src: string;
  frame?: keyof typeof FRAME;
  priority?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('bg-blue/25 relative overflow-hidden', FRAME[frame], className)}>
      <Image
        src={src}
        alt=""
        width={COVER_WIDTH}
        height={COVER_HEIGHT}
        priority={priority}
        className="size-full object-contain"
      />
      {children}
    </div>
  );
}
