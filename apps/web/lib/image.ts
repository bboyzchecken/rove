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

/**
 * What the file input accepts.
 *
 * `image/*` and not a list of three (Feedback #2 — D-14). The tester could
 * not upload a cover in UAT round 1, and the likeliest reason is the one a
 * strict list guarantees: an iPhone's camera roll is HEIC, and a file input
 * that names only JPG, PNG and WebP either hides those photos or refuses them
 * with a message about file types nobody chooses. The browser decides what it
 * can decode; `decodeImage` below says so plainly when it cannot.
 */
export const COVER_ACCEPT = 'image/*';

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

/**
 * Where the 3:2 window sits on the photo, 0–1 on each axis (0.5 = centred).
 * Only the axis with spare pixels matters: a landscape photo can slide left
 * and right, a portrait one up and down.
 */
export interface CoverFocus {
  x: number;
  y: number;
}

/** A decoded photo the picker can crop repeatedly without re-reading the file. */
export interface DecodedCover {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** A URL for the drag preview. Revoke it when done. */
  previewUrl: string;
  close: () => void;
}

function invalidFile(file: File) {
  if (!file.type.startsWith('image/')) return 'ใช้ได้เฉพาะไฟล์รูป (JPG, PNG, HEIC, WebP)';
  if (file.size > COVER_MAX_FILE_BYTES) {
    return `ไฟล์ใหญ่เกิน ${Math.round(COVER_MAX_FILE_BYTES / 1024 / 1024)}MB`;
  }
  return null;
}

/**
 * Reads the photo once, the right way up.
 *
 * `imageOrientation: 'from-image'` is the fix for the sideways cover: a phone
 * stores a portrait shot as landscape pixels plus an EXIF flag, and a canvas
 * ignores the flag. Where `createImageBitmap` is missing or refuses the
 * format, an `<img>` decode is tried — Safari can draw a HEIC it will not
 * hand to `createImageBitmap`.
 */
export async function decodeCover(file: File): Promise<DecodedCover> {
  const problem = invalidFile(file);
  if (problem) throw new Error(problem);

  const previewUrl = URL.createObjectURL(file);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        previewUrl,
        close: () => {
          bitmap.close();
          URL.revokeObjectURL(previewUrl);
        },
      };
    } catch {
      // fall through to the <img> path
    }
  }

  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('decode'));
  });
  image.src = previewUrl;
  try {
    await loaded;
  } catch {
    URL.revokeObjectURL(previewUrl);
    throw new Error(
      'เปิดไฟล์รูปนี้ไม่ได้ — ถ้าเป็น HEIC จาก iPhone ลองส่งเป็น JPG หรือเลือกรูปอื่น',
    );
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    previewUrl,
    close: () => URL.revokeObjectURL(previewUrl),
  };
}

/** Crops a decoded photo to the cover frame around `focus` and encodes it. */
export function cropCover(decoded: DecodedCover, focus: CoverFocus = { x: 0.5, y: 0.5 }): PreparedCover {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปให้ไม่ได้ เลือกจากรูปที่มีให้แทนได้');

  // Cover-crop: fill the 3:2 frame, and slide the overflow to where the
  // person dragged it (D-14 — "ลากจัดตำแหน่ง").
  const scale = Math.max(COVER_WIDTH / decoded.width, COVER_HEIGHT / decoded.height);
  const width = decoded.width * scale;
  const height = decoded.height * scale;
  const x = -(width - COVER_WIDTH) * clamp01(focus.x);
  const y = -(height - COVER_HEIGHT) * clamp01(focus.y);
  ctx.drawImage(decoded.source, x, y, width, height);

  for (const quality of QUALITIES) {
    const src = encode(canvas, quality);
    const bytes = byteLength(src);
    if (bytes <= MAX_ENCODED_BYTES) return { src, bytes };
  }
  throw new Error('รูปนี้หนักเกินไป ลองรูปที่รายละเอียดน้อยกว่านี้');
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));
}

/** One-shot: decode, centre-crop, encode. The picker uses the two halves. */
export async function coverFromFile(file: File, focus?: CoverFocus): Promise<PreparedCover> {
  const decoded = await decodeCover(file);
  try {
    return cropCover(decoded, focus);
  } finally {
    decoded.close();
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

/** What the photo picker accepts — anything the browser can decode. */
export const PHOTO_ACCEPT = 'image/*';

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
  if (!file.type.startsWith('image/')) {
    throw new Error('ใช้ได้เฉพาะไฟล์รูป (JPG, PNG, HEIC, WebP)');
  }
  if (file.size > PHOTO_MAX_FILE_BYTES) {
    throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(PHOTO_MAX_FILE_BYTES / 1024 / 1024)}MB`);
  }

  // The same decode as the cover — orientation honoured, HEIC given a chance.
  const decoded = await decodeCover(file);

  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(decoded.width * scale);
    canvas.height = Math.round(decoded.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปให้ไม่ได้');
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= PHOTO_MAX_ENCODED_BYTES) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return new File([blob], `${baseName(file.name)}.${ext}`, { type: blob.type });
      }
    }
    throw new Error('รูปนี้หนักเกินไป ลองรูปอื่น');
  } finally {
    decoded.close();
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
