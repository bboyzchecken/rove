# Brand assets (DEV_SPEC §15)

| file                   | what it is                                                    |
| ---------------------- | ------------------------------------------------------------- |
| `mark.svg`             | the 8-armed compass mark, terracotta — hand-authored geometry |
| `../../app/icon.svg`   | favicon / app icon: the mark on a cream disc                  |
| `hero-landing.webp`    | landing hero illustration                                     |
| `og-default.png`       | 1200×630 social card background (no text baked in)            |
| `texture-linen.webp`   | 420px cream linen tile, multiplied under `.bg-linen`          |
| `covers/*.webp`        | illustrated city covers for trip cards                        |
| `empty/*.webp`         | empty-state illustrations                                     |
| `../characters/*.webp` | the 20 characters (M14) — ids match `apps/api/data/characters.json` |

The wordmark is **not** an image: it is `components/brand/rove-logo.tsx`
(Prompt ExtraBold + the SVG mark) so it stays sharp at every size, per §15.

Everything else was generated with FLUX and can be regenerated:

```bash
node scripts/gen-brand-assets.mjs
```

The prompts and the exact resize rules live in that script — change them there,
not by hand-editing the output.
