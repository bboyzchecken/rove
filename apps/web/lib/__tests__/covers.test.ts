import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COVERS, DEFAULT_COVER, isBuiltInCover } from '../covers';

/**
 * The catalogue is hand-written and the files are generated, which is exactly
 * the pair that drifts: an entry added before its FLUX job has run makes the
 * cover picker offer a 404 that nobody notices until a trip wears it.
 */
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');

describe('cover catalogue', () => {
  it.each(COVERS)('$id has its file in public/', (cover) => {
    expect(existsSync(path.join(PUBLIC, cover.src))).toBe(true);
  });

  it('has no duplicate ids or sources', () => {
    expect(new Set(COVERS.map((cover) => cover.id)).size).toBe(COVERS.length);
    expect(new Set(COVERS.map((cover) => cover.src)).size).toBe(COVERS.length);
  });

  it('offers the cover every trip starts on', () => {
    expect(isBuiltInCover(DEFAULT_COVER)).toBe(true);
  });

  it('does not mistake an uploaded cover for one of ours', () => {
    expect(isBuiltInCover('data:image/webp;base64,UklGRg==')).toBe(false);
  });
});
