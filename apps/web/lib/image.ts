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

/* ------------------------------------------------------ trip photos (M18) - */

/** What the photo picker accepts. HEIC is handled by the OS on the way in. */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Refused before decoding — a RAW-sized file is a mistake, not a snapshot. */
export const PHOTO_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Longest edge after resizing. Big enough to fill a phone screen and print. */
const PHOTO_MAX_EDGE = 1600;

/** The upload budget per photo, after re-encoding. */
const PHOTO_MAX_ENCODED_BYTES = 900 * 1024;

/**
 * A trip photo, resized in the browser before it is uploaded (M18 — W18.2).
 *
 * Unlike a cover this is NOT cropped: the whole frame the person took is what
 * they want to keep. It is only scaled down to a sane edge and re-encoded, so
 * a 12MB phone original leaves as a few hundred kilobytes of WebP — which is
 * what makes uploading over hotel wifi bearable.
 *
 * Returns a `File`, not a data URL: photos go to object storage through
 * multipart, they do not ride inside a row the way a cover does.
 */
export async function photoFromFile(file: File): Promise<File> {
  if (!PHOTO_ACCEPT.split(',').includes(file.type)) {
    throw new Error('ใช้ได้เฉพาะไฟล์ JPG PNG หรือ WebP');
  }
  if (file.size > PHOTO_MAX_FILE_BYTES) {
    throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(PHOTO_MAX_FILE_BYTES / 1024 / 1024)}MB`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดไฟล์รูปนี้ไม่ได้ ลองไฟล์อื่น');
  }

  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปให้ไม่ได้');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= PHOTO_MAX_ENCODED_BYTES) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return new File([blob], `${baseName(file.name)}.${ext}`, { type: blob.type });
      }
    }
    throw new Error('รูปนี้หนักเกินไป ลองรูปอื่น');
  } finally {
    bitmap.close();
  }
}

/** Same WebP-or-JPEG check as `encode`, but as a real Blob for uploading. */
function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/webp') return resolve(blob);
        // The browser refused WebP and silently gave PNG — ask for JPEG.
        canvas.toBlob((jpeg) => resolve(jpeg), 'image/jpeg', quality);
      },
      'image/webp',
      quality,
    );
  });
}

function baseName(filename: string) {
  const dot = filename.lastIndexOf('.');
  const name = dot > 0 ? filename.slice(0, dot) : filename;
  return name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'photo';
}
