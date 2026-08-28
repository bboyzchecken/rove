# ROVE — Brand & Visual Spec v2

**Style name: doodle UI — neubrutalist layout with hand-drawn doodle accents.**

Use this exact phrase when briefing designers or writing tickets. It names both halves: the loud flat structure (neubrutalism) and the hand-drawn overlay (doodle).

This document is the single source of truth for the website rewrite and all generated illustration assets.

> **Changed in v2:** the hero is now a **full-bleed saturated color canvas**, not a cream page with small accents. Doodles and tags sit *on top of* type as a dense overlay. This reverses the "cream-dominant, sparse accent" rule from v1.

---

## 1. Direction

**Loud hero, calm content.**

Two modes, and the contrast between them *is* the design:

| | Hero / marketing | Content / app |
|---|---|---|
| Background | Full-bleed saturated brand color | White or cream |
| Type | Oversized, white, tight, heavy | Normal scale, ink |
| Doodles | Dense — 4–6 marks, overlapping type | Sparse — 0–1 per screen |
| Tags | Scattered, tilted, overlapping | Flat, aligned, untilted |

Never blend the two. A hero is fully committed; a content screen is fully calm.

**Feeling:** เหมือนโปสเตอร์ที่มีคนเอาปากกามาวาดเล่นทับ — จงใจ ไม่ใช่บังเอิญ

---

## 2. Color

### 2.1 Core palette

| Token | Hex | Name | Role |
|---|---|---|---|
| `--canvas-blue` | `#2B6BA8` | Deep cobalt | **Hero canvas.** Full-bleed backgrounds carrying white type |
| `--brand-blue` | `#3D86C8` | Cobalt | Buttons, links, tags, doodles |
| `--brand-yellow` | `#F0C045` | Mustard | Tags, highlight blocks, doodles |
| `--brand-pink` | `#EF91C0` | Pink | Tags, doodles, community moments |
| `--brand-green` | `#54B73C` | Green | Tags, doodles, money/confirm moments |
| `--brand-ink` | `#101010` | Ink | Body text, doodle strokes, knockout blocks, dark tags |
| `--brand-cream` | `#FFFCF1` | Cream | Content background |
| `--white` | `#FFFFFF` | White | Hero type, card surfaces, CTA fill |

### 2.2 The canvas rule (critical)

**Only `--canvas-blue #2B6BA8` and `--brand-ink #101010` may serve as a full-bleed background with white type.**

Yellow, pink, and green fail white-text contrast badly and must never be a hero canvas:

| Background | vs white | vs ink | Verdict |
|---|---|---|---|
| `#2B6BA8` | 5.57 | 3.42 | ✅ Hero canvas — white type |
| `#101010` | 18.9 | — | ✅ Hero canvas — white type |
| `#3D86C8` | 3.86 | 4.93 | ⚠️ Large display type only (48px+), never body |
| `#F0C045` | 1.70 | 11.17 | ❌ Never white. Ink only |
| `#EF91C0` | 2.21 | 8.59 | ❌ Never white. Ink only |
| `#54B73C` | 2.56 | 7.44 | ❌ Never white. Ink only |

Yellow, pink, and green live at **tag and doodle scale** — small elements where ink text sits on them. That's their job. It is also what keeps them feeling like accents rather than wallpaper.

### 2.3 Support / derived

| Token | Hex | Use |
|---|---|---|
| `--yellow-deep` | `#412402` | Text on yellow tags |
| `--blue-deep` | `#042C53` | Text on light-blue tags |
| `--pink-deep` | `#4B1528` | Text on pink tags |
| `--green-deep` | `#173404` | Text on green tags |
| `--cream-line` | `#E8E2D2` | Hairline dividers on cream |
| `--gray-body` | `#5F5E5A` | Body copy on cream/white |

### 2.4 Color-to-meaning lock

Fixed. Do not shuffle per section.

| Color | Always means |
|---|---|
| Yellow | Planning, dates, the trip itself |
| Blue | Action, booking, primary CTA |
| Green | Money, budget, split, confirmed |
| Pink | People, friends, community, sharing |
| Ink | Neutral, structural, or the one "serious" tag in a cluster |

---

## 3. Typography

| Role | Face | Weight | Notes |
|---|---|---|---|
| Hero display | Grotesk sans (`General Sans`, `Cabinet Grotesk`, `Satoshi`) | **700** | This is the one place 700 is allowed |
| H2 / H3 | Same family | 500 | |
| Body | Same family, or `Inter` | 400 | `line-height: 1.65` |
| Thai | `IBM Plex Sans Thai` or `Noto Sans Thai` | 400 / 500 | Must be paired — never let Thai fall back to a system serif |
| Tag | Display family | 500 | 11–12px, sentence case |

### 3.1 Hero type — the signature treatment

```
font-size:      44–56px mobile, 72–96px desktop
font-weight:    700
line-height:    0.95–1.0        ← tighter than normal, lines nearly touch
letter-spacing: -0.03em
color:          #FFFFFF
text-align:     left
max-width:      ~10 characters per line
```

Break lines **manually** so each line is short and the block reads as a stack. Ragged right edge is correct — do not justify, do not center.

### 3.2 Knockout highlight

One word per hero gets inverted: white block, ink text.

```css
background: #FFFFFF;
color: #101010;
padding: 0 10px;
border-radius: 4px;
```

Exactly one per hero. It should land on the word carrying the promise (`achieve.` in the reference). Optionally end that word with a period even mid-sentence — it adds a beat.

### 3.3 Rules

- **Sentence case everywhere.** No Title Case, no ALL CAPS
- Two weights per content screen: 400 and 500. Hero adds 700
- Never letterspace body copy

---

## 4. Tilted tags — the overlay layer

Small rotated pills scattered across the hero, overlapping the headline. Alongside the doodles, this is what makes the style recognizable.

### 4.1 Spec

```
padding:        6px 14px
border-radius:  999px
font-size:      11–12px
font-weight:    500
rotation:       -12° to +12°, never 0°
```

### 4.2 Rules

1. **4–6 tags per hero.** Fewer reads accidental; more reads cluttered.
2. **Every tag is a different angle.** Vary rotation, never repeat the same value twice.
3. **Never aligned to each other.** No shared baseline, no grid, no even spacing.
4. **They must overlap the headline** — sitting in the margin looks timid. Overlap the edge of a letter, not the middle of a word.
5. **Color mix per cluster:** 2 accent colors + 1 ink tag. The ink tag anchors the cluster.
6. **Text is a real category** (`Advertising`, `Design`) — one or two words, sentence case, never a slogan.
7. **Never cover the knockout highlight.** That word stays clean.

### 4.3 Colors

| Tag fill | Text |
|---|---|
| `--brand-yellow` | `--yellow-deep` |
| `--brand-pink` | `--pink-deep` |
| `--brand-green` | `--green-deep` |
| `--brand-blue` | `#FFFFFF` |
| `--brand-ink` | `#FFFFFF` |

---

## 5. Doodle line style

### 5.1 Hard rules

1. **Stroke only.** No fill, ever. A doodle is a line drawing, not a shape.
2. **Stroke color:** on a hero canvas, use `--brand-pink`, `--brand-green`, `--brand-yellow`, or `#FFFFFF`. On white/cream, use `--brand-ink`.
3. **Stroke weight:** 3–4px at 100% scale. Uniform within one doodle. Never variable-width or calligraphic.
4. **Round caps and round joins.** Always.
5. **Slightly imperfect.** Lines wobble, circles don't quite close, symmetry is approximate. Drawn in one confident pass — not traced, not geometric.
6. **No faces.** These are marks and objects, not characters. (Deliberate: line doodles are cheaper to produce, scale better, and don't lock the brand into a mascot.)
7. **Scale varies wildly.** One large doodle (200px+) anchors the composition; the rest are 40–80px. Same-size doodles read as clip art.

### 5.2 Vocabulary

Build the whole site from this fixed set. Do not invent new marks ad hoc.

| Mark | Description | Where it goes |
|---|---|---|
| **Flower** | 6–8 long rounded petals, small circle center | The large hero anchor doodle |
| **Starburst** | 6–8 uneven spiky points | Second-largest hero mark |
| **Curl arrow** | Curved arrow with a loop in its tail | Pointing at the CTA, bottom of hero |
| **Underline scribble** | 2–3 overlapping loose strokes | Under a section heading |
| **Circle-around** | Rough open ellipse around a word or icon | Highlighting one word in content |
| **Spiral** | Loose open spiral, 2–3 turns | Whitespace filler, loading states |
| **Sparkle** | Small 4-point cross-star, clustered ×2–3 | Near AI features |
| **Wave line** | Horizontal wavy line, 3–4 crests | Section dividers |
| **Dotted path** | Dashed curve ending in a small circle | Route and journey moments |
| **Heart** | Lopsided single-stroke open heart | Saved / favorite |

### 5.3 Density

- **Hero:** 3–4 doodles — one large anchor + 2–3 small
- **Content section:** 1–2, in the margin
- **Cards:** 0–1, only with spare space
- Doodles may overlap **display type**; they must never overlap **body copy**

---

## 6. Hero layer order

Bottom to top:

```
1. Canvas          full-bleed --canvas-blue or --brand-ink
2. Large doodle    the anchor mark, partially behind the headline
3. Headline        white 700, manual line breaks
4. Knockout word   white block, ink text
5. Small doodles   2–3 marks, in the gaps
6. Tilted tags     4–6 pills, overlapping letter edges
7. CTA             white pill, bottom, full-width or wide
```

The headline sits **between** doodle layers. That interleaving is what makes it read as drawn-on rather than pasted-over.

---

## 7. Component patterns

### Hero CTA
- White fill, ink text, `border-radius: 999px`, padding `16px 32px`
- Near-full-width on mobile
- A curl arrow doodle points at it from just outside the edge — never inside

### Buttons (content areas)
- Primary: `--brand-blue` fill, white text, `border-radius: 999px`
- Secondary: transparent, `1.5px solid --brand-ink`, ink text
- Dark: `--brand-ink` fill, white text — nav CTA only

### Cards (content areas)
- `border-radius: 14–16px`, no shadow
- Either flat accent fill with matching `-deep` text, or white with `1px solid --cream-line`
- Content-area tags are **flat and untilted** — tilting is a hero-only device

### Sections
- Vertical rhythm: `80px` desktop, `48px` mobile
- Content areas alternate cream → white → cream
- Full-bleed color returns only for a mid-page CTA band or the footer

### Nav
- Transparent over the hero canvas, white wordmark, white pill CTA on the right
- Wordmark: `rove` lowercase, period in `--brand-yellow` when on blue canvas

---

## 8. Flux BFL — image generation

### 8.1 Base prompt block

Append to every doodle generation:

```
hand-drawn doodle line art, single continuous stroke,
uniform 4px line weight, rounded line caps and joins,
no fill, outline only, open shape,
slightly imperfect wobbly hand-drawn line, marker pen feel,
centered on plain flat white background,
minimal, sparse, generous negative space,
flat 2D, no perspective, no shading, no gradient, no shadow,
sticker doodle, modern branding illustration
```

### 8.2 Negative prompt

```
filled shape, solid fill, color fill, gradient, shading, drop shadow,
3D, realistic, photorealistic, watercolor, sketchy hatching,
crosshatch, pencil texture, grain, noise,
thick variable line width, calligraphic stroke,
face, eyes, character, mascot, text, letters, numbers, watermark,
busy background, pattern, multiple objects, cluttered
```

### 8.3 Per-asset subject lines

| Asset | Subject line |
|---|---|
| Flower | `a simple doodle flower with eight long rounded petals and a small circle center` |
| Starburst | `a doodle starburst with eight uneven sharp pointed spikes` |
| Curl arrow | `a curved doodle arrow with a single loop in its tail, pointing down` |
| Underline | `three loose overlapping doodle underline strokes` |
| Circle-around | `a rough hand-drawn oval circle outline, open at one point` |
| Spiral | `a loose open doodle spiral with three turns` |
| Sparkle | `three small four-pointed doodle sparkle stars of different sizes` |
| Wave | `a horizontal wavy doodle line with four crests` |
| Dotted path | `a curved doodle dashed line ending in a small circle` |
| Heart | `a lopsided single-stroke doodle heart outline` |

### 8.4 Settings

- **Model:** FLUX 1.1 Pro (best line consistency), or FLUX.1 [dev]
- **Aspect:** `1:1`
- **Guidance:** 3.0–4.0 — higher over-renders and adds unwanted fill
- **Steps:** 28–35
- **Seed:** lock one seed for the whole set and reuse it across every asset, so line weight stays consistent

Generate on **white**, not on the brand color. Color is applied in code via `stroke`, so the same asset can be pink on a hero and ink on a content page.

### 8.5 Post-processing (required)

1. Generate at high resolution
2. Auto-trace to SVG (Illustrator Image Trace → *Black and White Logo* preset, or `vectorizer.ai`)
3. Manually simplify: delete stray points, close obvious gaps
4. Set `fill: none`, `stroke: currentColor`, `stroke-width: 4`, `stroke-linecap: round`, `stroke-linejoin: round`
5. Save as inline SVG components — **not** `<img>` tags, so stroke color is themeable per section

> Raster output has soft edges that fight this style's crispness the moment it scales. SVG conversion is not optional.

---

## 9. Do / Don't

| Do | Don't |
|---|---|
| Full-bleed blue or ink hero | Yellow, pink, or green as a hero canvas |
| White type on blue/ink only | White type on yellow, pink, or green |
| Tags tilted, each a different angle | Tags aligned or evenly spaced |
| Tags overlapping letter edges | Tags parked in the margin |
| One large doodle + small ones | All doodles the same size |
| Line-only doodles | Filled doodle shapes |
| One knockout word per hero | Three highlighted phrases |
| Calm white content sections | Doodle overlay on every screen |
| Sentence case | Title Case, ALL CAPS |
| Doodles over display type | Doodles over body copy |

---

## 10. Rewrite checklist

- [ ] Replace all palette tokens with §2; delete every terracotta / espresso / warm-clay value
- [ ] Add `--canvas-blue #2B6BA8`; audit that no hero uses yellow, pink, or green as a full-bleed background
- [ ] Load display + Thai font pair; confirm no serif fallback on Thai strings
- [ ] Rebuild the hero: full-bleed canvas, 700-weight white display, manual line breaks
- [ ] Add one knockout highlight word per hero — exactly one
- [ ] Add 4–6 tilted tags per hero, all different angles, overlapping the headline
- [ ] Generate the 10 doodles in §8.3 with a locked seed
- [ ] Convert all 10 to inline SVG with `stroke: currentColor`
- [ ] Delete every existing illustration and warm-filtered photo asset
- [ ] Verify layer order from §6 — headline sits between doodle layers
- [ ] Strip tilt from all content-area tags — tilting is hero-only
- [ ] Audit contrast against the §2.2 table
- [ ] Mobile: doodles scale down or drop; tags never cover more than one letter
