# Brand assets (DEV_SPEC §15)

| file                   | what it is                                                    |
| ---------------------- | ------------------------------------------------------------- |
| `mark.svg`             | the 8-armed compass mark, terracotta — hand-authored geometry |
| `../../app/icon.svg`   | favicon / app icon: the mark on a cream disc                  |
| `og-default.png`       | 1200×630 social card background (no text baked in)            |
| `texture-linen.webp`   | 420px cream linen tile, multiplied under `.bg-linen`          |
| `covers/*.webp`        | trip covers: six destinations + nine vibes, 1200x800 (3:2)    |
| `empty/*.webp`         | empty-state illustrations                                     |
| `../characters/*.webp` | the 20 characters (M14) — ids match `apps/api/data/characters.json` |

`covers/cover-placeholder.webp` is the neutral one every trip starts on, and
the whole set is offered by `components/trip/trip-cover-sheet.tsx` through the
catalogue in `apps/web/lib/covers.ts` — add the generator job first, then the
catalogue entry, or the picker offers a 404.

The wordmark is **not** an image: it is `components/brand/rove-logo.tsx`
(Prompt ExtraBold + the SVG mark) so it stays sharp at every size, per §15.

Everything else was generated with FLUX and can be regenerated:

```bash
BFL_API_KEY=... node scripts/gen-brand-assets.mjs
```

Add `--only scenes` / `--match '^cover-'` to re-cut one family instead of paying
for the whole set, and `SHARP_PATH=<dir>` to point at an installation of sharp
(it is not a project dependency: only this script needs it).

The prompts and the exact resize rules live in that script — change them there,
not by hand-editing the output.
