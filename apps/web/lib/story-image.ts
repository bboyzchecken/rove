/**
 * The 1:1 trip summary people actually post (W10.7).
 *
 * Drawn on a canvas in the browser rather than rendered on a server. A trip
 * card is title, dates, a handful of places and one number — the group already
 * has all of it on screen, so shipping it to a renderer and back would add a
 * round trip, an auth hop and a second place for the brand to drift, to produce
 * a picture the phone can draw in twenty milliseconds. It also means the button
 * works identically in mock mode, offline, and on the flight home.
 *
 * Colours are read from `styles/brand.css` at draw time — §15 forbids a hex
 * literal here as much as anywhere else.
 */

export const STORY_SIZE = 1080;

export interface StoryInput {
  title: string;
  /** "15–22 พ.ย." — already formatted by the caller. */
  dateLabel: string;
  days: number;
  nights: number;
  cities: string[];
  /** Up to five stops worth bragging about. */
  highlights: string[];
  /** Whole baht per person; 0 hides the line. */
  perPersonThb: number;
  brandName: string;
}

/** Reads an HSL triple from brand.css and returns a CSS colour string. */
function token(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : fallback;
}

export function drawStoryImage(input: StoryInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_SIZE;
  canvas.height = STORY_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้สร้างรูปสรุปทริปไม่ได้');

  const primary = token('--brand-primary', 'hsl(208 56% 51%)');
  const ink = token('--brand-ink', 'hsl(0 0% 6%)');
  const muted = token('--brand-muted', 'hsl(48 3% 36%)');
  const surface = token('--brand-surface', 'hsl(0 0% 100%)');
  const bg = token('--brand-bg', 'hsl(47 100% 97%)');

  // Canvas cannot use the `--font-*` variables — those are class names on the
  // document, not families. The families are named here and only here, and
  // must track `app/layout.tsx`.
  const font = (size: number, weight = 400) =>
    `${weight} ${size}px "IBM Plex Sans Thai", "Space Grotesk", Inter, system-ui, sans-serif`;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_SIZE, STORY_SIZE);

  // A blue band down the left edge instead of a background photo: the covers
  // are light illustrations and text over them needs a scrim heavy enough to
  // hide the artwork it is sitting on.
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 24, STORY_SIZE);

  const pad = 96;
  let y = 180;

  ctx.fillStyle = muted;
  ctx.font = font(34, 500);
  ctx.fillText(input.dateLabel, pad, y);

  y += 92;
  ctx.fillStyle = ink;
  y = wrapText(ctx, input.title, pad, y, STORY_SIZE - pad * 2, 84, font(76, 700));

  y += 20;
  ctx.fillStyle = muted;
  ctx.font = font(36, 500);
  const frame = [
    `${input.days} วัน ${input.nights} คืน`,
    ...input.cities.slice(0, 3),
  ].join(' · ');
  ctx.fillText(frame, pad, y);

  // Highlights, as a list rather than a paragraph: this is the part someone
  // reading the post actually screenshots.
  y += 96;
  for (const highlight of input.highlights.slice(0, 5)) {
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(pad + 10, y - 12, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ink;
    ctx.font = font(40, 500);
    ctx.fillText(ellipsis(ctx, highlight, STORY_SIZE - pad * 2 - 48), pad + 44, y);
    y += 74;
  }

  if (input.perPersonThb > 0) {
    const boxTop = STORY_SIZE - 300;
    ctx.fillStyle = surface;
    roundRect(ctx, pad, boxTop, STORY_SIZE - pad * 2, 132, 28);
    ctx.fill();

    ctx.fillStyle = muted;
    ctx.font = font(30, 500);
    ctx.fillText('โดยประมาณต่อคน', pad + 40, boxTop + 52);

    ctx.fillStyle = ink;
    ctx.font = font(56, 700);
    ctx.fillText(`฿${input.perPersonThb.toLocaleString('th-TH')}`, pad + 40, boxTop + 108);
  }

  // The mark, drawn rather than loaded: an <img> would make this async for one
  // compass rose made of four lines.
  drawMark(ctx, pad, STORY_SIZE - 128, 44, primary);
  ctx.fillStyle = muted;
  ctx.font = font(30, 500);
  ctx.fillText(input.brandName, pad + 64, STORY_SIZE - 116);

  return canvas;
}

/** The finished picture as a PNG blob, ready to download or share. */
export function storyBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('สร้างรูปไม่สำเร็จ'))),
      'image/png',
    );
  });
}

/* ------------------------------------------------------------------ paint -- */

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  font: string,
) {
  ctx.font = font;

  // Thai does not put spaces between words, so a space-split would leave one
  // very long "word". Falling back to a character walk keeps both scripts
  // wrapping at the same place they visually run out of room.
  const chunks = text.includes(' ') ? text.split(' ') : Array.from(text);
  const joiner = text.includes(' ') ? ' ' : '';

  let line = '';
  let cursor = y;
  let lines = 0;

  for (const chunk of chunks) {
    const candidate = line ? line + joiner + chunk : chunk;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      lines += 1;
      line = chunk;
      // Three lines of title is a poster; four is a wall.
      if (lines === 2) break;
    } else {
      line = candidate;
    }
  }

  ctx.fillText(ellipsis(ctx, line, maxWidth), x, cursor);
  return cursor;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** The eight-armed compass rose from public/brand/mark.svg, in four strokes. */
function drawMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const half = size / 2;
  const cx = x + half;
  const cy = y + half;
  const diagonal = half * 0.72;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.13;
  ctx.lineCap = 'round';

  const arms: [number, number, number, number][] = [
    [cx, cy - half, cx, cy + half],
    [cx - half, cy, cx + half, cy],
    [cx - diagonal, cy - diagonal, cx + diagonal, cy + diagonal],
    [cx + diagonal, cy - diagonal, cx - diagonal, cy + diagonal],
  ];
  for (const [x1, y1, x2, y2] of arms) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}
