import { COVER_HEIGHT, COVER_WIDTH } from '@/lib/covers';

/**
 * Turning a photo off someone's phone into a trip cover — in the browser.
 *
 * A phone photo is 4000px wide and four megabytes; a cover is 1200×800 and
 * rides inside the trip record. So the file never leaves this function as a
 * file: it is cropped to the cover frame, re-encoded, and handed back as a
 * data URL that `PATCH cover` can carry like any other cover string.
 *
 * That is also why the sizes below are advertised in the picker rather than
 * enforced silently — an upload that is quietly cropped to something the user
 * did not choose is worse than one that says "3:2, we crop the middle".
 */

/** What the file input accepts. */
export const COVER_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Refused before decoding — a 50MP panorama is a mistake, not a cover. */
export const COVER_MAX_FILE_BYTES = 12 * 1024 * 1024;

/** The encoded cover travels with the trip, so it is capped as well. */
const MAX_ENCODED_BYTES = 500 * 1024;

/** Tried in order; the first one small enough wins. */
const QUALITIES = [0.82, 0.72, 0.6, 0.5];

export interface PreparedCover {
  /** A data URL — `src` for next/image and the value stored on the trip. */
  src: string;
  /** What it weighs once encoded, so the picker can say so. */
  bytes: number;
}

export async function coverFromFile(file: File): Promise<PreparedCover> {
  if (!COVER_ACCEPT.split(',').includes(file.type)) {
    throw new Error('ใช้ได้เฉพาะไฟล์ JPG PNG หรือ WebP');
  }
  if (file.size > COVER_MAX_FILE_BYTES) {
    throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(COVER_MAX_FILE_BYTES / 1024 / 1024)}MB`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองไฟล์อื่น');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = COVER_WIDTH;
    canvas.height = COVER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปให้ไม่ได้ เลือกจากรูปที่มีให้แทนได้');

    // Cover-crop from the centre: fill the 3:2 frame and let the overflow go,
    // which is what the preview in the picker shows before anything is saved.
    const scale = Math.max(COVER_WIDTH / bitmap.width, COVER_HEIGHT / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    ctx.drawImage(bitmap, (COVER_WIDTH - width) / 2, (COVER_HEIGHT - height) / 2, width, height);

    for (const quality of QUALITIES) {
      const src = encode(canvas, quality);
      const bytes = byteLength(src);
      if (bytes <= MAX_ENCODED_BYTES) return { src, bytes };
    }
    throw new Error('รูปนี้หนักเกินไป ลองรูปที่รายละเอียดน้อยกว่านี้');
  } finally {
    bitmap.close();
  }
}

/**
 * WebP first, JPEG if the browser will not encode it.
 *
 * A canvas asked for a type it cannot write answers PNG instead of failing —
 * and a PNG of a photo is several times the size — so the answer is checked,
 * not assumed.
 */
function encode(canvas: HTMLCanvasElement, quality: number) {
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Bytes behind a base64 data URL, without materialising them. */
function byteLength(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** "1.2MB" — used by the picker to say how heavy an upload turned out. */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
