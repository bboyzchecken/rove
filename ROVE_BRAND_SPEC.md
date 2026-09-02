# ROVE — Brand & Visual Spec v3

**Style name: doodle UI — soft neubrutalism with hand-drawn doodle accents.**

Use this exact phrase when briefing designers or writing tickets. It names both halves: flat blocks with no shadows and heavy rounding (soft neubrutalism), plus a hand-drawn overlay (doodle).

This document is the single source of truth for the website rewrite and all generated illustration assets.

> **Changed in v3:** the palette is replaced entirely. The system is now **white-based with pastel feature surfaces**, not a saturated full-bleed canvas. Every color is now paired (light surface + solid accent) and locked to one product feature. The v2 `--canvas-blue` hero and its white display type are removed.

---

## 1. Direction

**White page, pastel rooms.**

The product is a set of feature areas, each with its own color identity. A user should know which part of ROVE they're in from a glance at the color, before reading anything. That is the whole idea, and it is what fixes the "ไม่ get ทันที" problem from UAT — recognition comes from consistent color-to-feature mapping, not from a single memorable brand hue.

Black does the work. Every primary action is a black pill. Color never competes with the CTA.

**Feeling:** สะอาด สว่าง เป็นระเบียบ แต่มี doodle กับสีพาสเทลทำให้ไม่แข็ง

---

## 2. Color

### 2.1 Neutrals

| Token | Hex | Role |
|---|---|---|
| `--white` | `#FFFFFF` | Page background. The default for every screen |
| `--gray-surface` | `#F7F7F7` | Secondary buttons, input fields, subtle blocks, disabled states |
| `--black` | `#000000` | Primary CTA fill, all body text, all doodle strokes |

### 2.2 Feature colors

Each feature owns a **pair**: a light surface and a solid accent. Never use one without knowing which role it plays.

| Feature | Light (surface) | Solid (accent) | Meaning |
|---|---|---|---|
| **Itinerary & Map** | `#B4F3FF` | `#40D7FF` | Sky, travel, the route |
| **Wishlist** | `#FFC7ED` | `#FF70D1` | Voting, wanting, playful and a bit romantic |
| **Trip countdown** | `#FFF08E` | `#F9D539` | Anticipation, excitement before departure |
| **Journal** | `#BDFFAA` | `#7DF55B` | Private writing, calm |
| **Documents & Finance** | `#FFC799` | `#FF953E` | Needs attention — check this |
| **Memo** | `#DCC0FF` | `#B377FF` | Notes, quick capture |

### 2.3 Light vs solid — the split

| | Light | Solid |
|---|---|---|
| **Used for** | Card fills, section backgrounds, banners, chips | Icon circles, checkmarks, dots, active indicators, doodle strokes, progress fills |
| **Size** | Large areas | Small elements, usually under 48px |
| **Rule** | Big and calm | Small and loud |

A solid color must never fill a large area. Its saturation is the point — spend it on something the eye lands on.

### 2.4 The one text rule

Contrast was measured for all twelve colors:

| Surface | vs black | vs white |
|---|---|---|
| All 6 light colors | 13.0 – 18.1 | 1.16 – 1.61 |
| All 6 solid colors | 7.0 – 15.1 | 1.39 – 3.00 |
| `#F7F7F7` | 19.6 | — |
| `#000000` | — | 21.0 |

**Black text on every color. White text only on black.** No exceptions, no per-color special cases. Every color passes AAA with black and fails badly with white — including the solid variants.

This is also why checkmarks and icons sitting on solid accent circles are **black**, not white.

### 2.5 One feature color per screen

A screen belongs to one feature and shows one color pair. Mixing pastels on a single screen destroys the mapping and returns to the "generic playful" look UAT rejected.

Exceptions — the only places multiple feature colors may appear together:
- The home / trip dashboard, where each feature is a separate entry card
- A legend or settings screen listing all features
- The doodle overlay on the marketing hero

### 2.6 Warning-state conflict

Orange serves double duty: it is the Documents & Finance identity **and** the "needs checking" signal. Inside Documents & Finance these collide — a whole orange screen makes an orange alert invisible.

Resolution: inside Documents & Finance, warnings use **solid orange `#FF953E` at small scale** (a filled dot, a left border bar, a filled icon) against the light orange `#FFC799` surface. Never a full orange banner on an orange screen. Elsewhere in the product, a light-orange banner is the standard warning treatment.

---

## 3. Typography

| Role | Face | Weight | Notes |
|---|---|---|---|
| Display | Grotesk sans (`General Sans`, `Cabinet Grotesk`, `Satoshi`) | 700 | Marketing hero only |
| H2 / H3 | Same family | 500 | |
| Body | Same family, or `Inter` | 400 | `line-height: 1.65` |
| Thai | `IBM Plex Sans Thai` or `Noto Sans Thai` | 400 / 500 | Must be paired — never let Thai fall back to a system serif |
| Label / chip | Display family | 500 | 11–12px, sentence case |

### Type scale

```
Hero        44–56px mobile, 72–96px desktop / 0.95–1.0 / -0.03em / weight 700
H2          28–32px / 1.2  / -0.02em / weight 500
H3          20px    / 1.3           / weight 500
Body        15–16px / 1.65          / weight 400
Small       13px    / 1.6
Label       11–12px / 1.4
```

### Rules

- **Sentence case everywhere.** No Title Case, no ALL CAPS
- Two weights per app screen: 400 and 500. Marketing hero may add 700
- Never letterspace body copy
- Hero: break lines manually, ~10 characters per line, left-aligned, ragged right

### Knockout highlight (marketing only)

One word per hero gets inverted: black block, white text.

```css
background: #000000;
color: #FFFFFF;
padding: 0 10px;
border-radius: 4px;
```

Exactly one per hero, on the word carrying the promise. This is the only place white text appears.

---

## 4. Shape language

Heavy rounding, zero shadows. Consistent across every component.

```
Pills / buttons / chips    border-radius: 999px
Cards / surfaces           border-radius: 20–24px
Small blocks / inputs      border-radius: 14–16px
Knockout highlight         border-radius: 4px
```

**No shadows anywhere.** No `box-shadow`, no glow, no blur. Separation comes from color and spacing. This is the single most important rule for keeping the style crisp — one drop shadow and it reads as generic SaaS.

### 4.1 Hero tilted tags — where the rules actually live

This document has never carried them, but the code cites them as "§4.2.1" through "§4.2.7". Those numbers resolve to nothing here. The rules they name — how many pills per hero, the angles, never covering a whole word, one ink tag anchoring the cluster — are written at the top of [`components/brand/tilted-tag.tsx`](apps/web/components/brand/tilted-tag.tsx), and the placement geometry is in [`components/brand/hero-canvas.tsx`](apps/web/components/brand/hero-canvas.tsx). Read those before changing a hero; do not go looking for a §4.2 in this file.

**Two deliberate divergences from those comments, both on the landing page (Feedback #1):**

- **Six tags, one per feature color, and no ink tag.** The comment asks every cluster to carry a black pill as its anchor. Six feature colors plus black is seven, and the same comment calls more than six cluttered — asked for the six chosen colors, the complete map won over the anchor. `/pricing` and `/explore` still follow the original rule.
- **Below `lg` the cluster is not an overlay.** It becomes a flat, untilted row under the lead, on every page that uses `HeroCanvas`. A tag hangs off the headline into the page gutter and a phone has no gutter, so the old behaviour showed one tag and dropped the rest — acceptable for two decorative pills, wrong for six load-bearing ones.

---

## 5. Doodle line style

> **The landing page is currently an exception to all of §5 — 2 ก.ย. 2569, Feedback #1.**
>
> `/` carries **no doodles at all**. The flower anchor, the starburst, the sparkle, the curl arrow, the dotted path and the heading underline were all removed from it: *"เริ่มต้นก่อนจะได้ mascot or ลายเส้นประจำ / เอาออกก่อนได้ ให้ได้สีแค่ที่ต้องการก่อน"*. The marks were a guess at a hand nobody had chosen yet, and six of them on the first page a stranger sees made that guess look like a decision.
>
> **Every other surface still follows this section** — `/pricing`, `/explore`, `/login`, empty states, status and legal pages, eleven files in all. §5 is live for them and is not being rewritten.
>
> **What ends the exception:** a mascot or a settled signature line style. When that exists, decide deliberately whether the landing hero gets marks again — do not simply restore the old six because this note says they were removed.
>
> Until then the landing hero's emphasis rests entirely on display type scale and its six tilted tags. That is a thinner margin than the rest of the site has, and it is worth knowing before trimming either.

### 5.1 Hard rules

1. **Stroke only.** No fill, ever. A doodle is a line drawing, not a shape.
2. **Stroke color:** `--black` on white, gray, and all light surfaces. On a marketing hero, doodles may take the solid accent colors.
3. **Stroke weight:** 3–4px at 100% scale. Uniform within one doodle. Never variable-width or calligraphic.
4. **Round caps and round joins.** Always.
5. **Slightly imperfect.** Lines wobble, circles don't quite close, symmetry is approximate. Drawn in one confident pass — not traced, not geometric.
6. **No faces.** These are marks and objects, not characters. (Deliberate: line doodles are cheaper to produce, scale better, and don't lock the brand into a mascot.)
7. **Scale varies.** One large doodle anchors a composition; the rest are 40–80px. Same-size doodles read as clip art.

### 5.2 Vocabulary

Build the whole site from this fixed set. Do not invent new marks ad hoc.

| Mark | Description | Feature home |
|---|---|---|
| **Dotted path** | Dashed curve ending in a small circle | Itinerary & Map |
| **Wave line** | Horizontal wavy line, 3–4 crests | Itinerary & Map, section dividers |
| **Heart** | Lopsided single-stroke open heart | Wishlist |
| **Sparkle** | Small 4-point cross-star, clustered ×2–3 | Wishlist, AI features |
| **Starburst** | 6–8 uneven spiky points | Trip countdown |
| **Spiral** | Loose open spiral, 2–3 turns | Trip countdown, loading states |
| **Flower** | 6–8 long rounded petals, small circle center | Journal |
| **Underline scribble** | 2–3 overlapping loose strokes | Journal, under headings |
| **Circle-around** | Rough open ellipse around a word or icon | Documents — flagging one item |
| **Curl arrow** | Curved arrow with a loop in its tail | Memo, pointing at CTAs |

Each feature has 2 doodles it uses consistently. That pairing reinforces the color mapping — a user starts recognizing the section by its mark as well as its color, which is what makes the identity survive being seen in grayscale.

**Hero anchors are not a property of one mark.** The Flower was listed here as "hero anchor" while it happened to be the landing page's; that page has no anchor now, and the two heroes that still take one use **Starburst** (`/pricing`) and **Spiral** (`/explore`). Any mark large enough to bleed off-frame can anchor a hero — what the anchor must not do is contradict the feature the page is about.

### 5.3 Density

- **Marketing hero:** 3–4 doodles — one large anchor plus 2–3 small
- **Landing hero (`/`):** **0** — see the note at the top of §5
- **App screen:** 0–1, in the margin or an empty state
- **Cards:** 0–1, only with spare space
- **Landing content sections:** **0** — the same exception; every other page keeps its one-per-section mark
- Doodles may overlap **display type**; never **body copy**

---

## 6. Component patterns

### Buttons

| Type | Fill | Text | Use |
|---|---|---|---|
| Primary | `#000000` | White | The one main action per screen |
| Secondary | `#F7F7F7` | Black | Everything else |
| Tertiary | transparent, `1.5px solid #000000` | Black | Low-emphasis |

All `border-radius: 999px`, padding `14px 28px`. Never color a primary button with a feature color — feature color is context, black is action.

### Feature cards
- Light color fill, black text, `border-radius: 20–24px`, no shadow
- Solid accent circle (36–44px) at one corner holding a black icon or checkmark
- Generous internal padding, `20–24px`

### Toggles and selection
- Selected: solid accent circle with a black checkmark
- Unselected: white circle, no mark
- The surrounding row stays light-colored in both states — only the circle changes

### Chips / tags
- `border-radius: 999px`, padding `6px 14px`, 11–12px, black text
- Light fill for passive, solid fill for active

### Inputs
- `#F7F7F7` fill, no border, `border-radius: 14–16px`, black text
- Focus: `2px solid #000000`

### Sections
- Vertical rhythm: `80px` desktop, `48px` mobile
- White by default; a feature section may take its light color full-width
- Never two different feature colors adjacent — put white between them

### Nav
- White, black wordmark, black pill CTA on the right
- Wordmark: `rove` lowercase, period in the current section's solid accent color

---

## 7. Flux BFL — image generation

### 7.1 Base prompt block

Append to every doodle generation:

```
hand-drawn doodle line art, single continuous black stroke,
uniform 4px line weight, rounded line caps and joins,
no fill, outline only, open shape,
slightly imperfect wobbly hand-drawn line, marker pen feel,
centered on plain flat white background,
minimal, sparse, generous negative space,
flat 2D, no perspective, no shading, no gradient, no shadow,
sticker doodle, modern branding illustration
```

### 7.2 Negative prompt

```
filled shape, solid fill, color fill, gradient, shading, drop shadow,
3D, realistic, photorealistic, watercolor, sketchy hatching,
crosshatch, pencil texture, grain, noise,
thick variable line width, calligraphic stroke,
face, eyes, character, mascot, text, letters, numbers, watermark,
busy background, pattern, multiple objects, cluttered
```

### 7.3 Per-asset subject lines

| Asset | Subject line |
|---|---|
| Dotted path | `a curved doodle dashed line ending in a small circle` |
| Wave | `a horizontal wavy doodle line with four crests` |
| Heart | `a lopsided single-stroke doodle heart outline` |
| Sparkle | `three small four-pointed doodle sparkle stars of different sizes` |
| Starburst | `a doodle starburst with eight uneven sharp pointed spikes` |
| Spiral | `a loose open doodle spiral with three turns` |
| Flower | `a simple doodle flower with eight long rounded petals and a small circle center` |
| Underline | `three loose overlapping doodle underline strokes` |
| Circle-around | `a rough hand-drawn oval circle outline, open at one point` |
| Curl arrow | `a curved doodle arrow with a single loop in its tail, pointing down` |

### 7.4 Settings

- **Model:** FLUX 1.1 Pro (best line consistency), or FLUX.1 [dev]
- **Aspect:** `1:1`
- **Guidance:** 3.0–4.0 — higher over-renders and adds unwanted fill
- **Steps:** 28–35
- **Seed:** lock one seed for the whole set and reuse it across every asset, so line weight stays consistent

Generate in **black on white**, never in a brand color. Color is applied in code via `stroke`, so one asset serves every feature section.

### 7.5 Post-processing (required)

1. Generate at high resolution
2. Auto-trace to SVG (Illustrator Image Trace → *Black and White Logo* preset, or `vectorizer.ai`)
3. Manually simplify: delete stray points, close obvious gaps
4. Set `fill: none`, `stroke: currentColor`, `stroke-width: 4`, `stroke-linecap: round`, `stroke-linejoin: round`
5. Save as inline SVG components — **not** `<img>` tags, so stroke color is themeable per section

> Raster output has soft edges that fight this style's crispness the moment it scales. SVG conversion is not optional.

> These ten marks are simple enough that hand-authored SVG will beat generation on consistency and file size. Generate only if hand-authoring isn't an option.

---

## 8. Do / Don't

| Do | Don't |
|---|---|
| White page background | Full-bleed saturated backgrounds |
| Black text on every color | White text on any color except black |
| Black primary CTA | Feature-colored primary buttons |
| Light colors for large areas | Solid colors for large areas |
| Solid colors for small accents | Solid colors as section backgrounds |
| One feature color per screen | Pastel rainbow on one screen |
| Heavy rounding, flat fills | Any shadow, glow, or blur |
| Black checkmarks on solid circles | White checkmarks |
| Line-only doodles | Filled doodle shapes |
| One knockout word per hero | Multiple highlighted phrases |
| Sentence case | Title Case, ALL CAPS |
| White between colored sections | Two feature colors adjacent |

---

## 9. Rewrite checklist

- [ ] Replace every palette token with §2; delete all terracotta / espresso / cream / cobalt values from v1–v2
- [ ] Set page background to `#FFFFFF` everywhere; remove `#FFFCF1` cream
- [ ] Convert every primary button to black `#000000` with white text
- [ ] Convert every secondary button to `#F7F7F7` with black text
- [ ] Map each feature area to its color pair per §2.2 and audit that no screen mixes pairs
- [ ] Confirm no white text anywhere except on black
- [ ] Confirm no solid accent color fills an area larger than ~48px
- [ ] Strip every `box-shadow` from the codebase
- [ ] Apply the radius scale from §4
- [ ] Handle the Documents & Finance warning conflict per §2.6
- [ ] Author or generate the 10 doodles in §7.3
- [ ] Convert all 10 to inline SVG with `stroke: currentColor`
- [ ] Assign 2 doodles per feature per §5.2 and use them consistently
- [ ] Load display + Thai font pair; confirm no serif fallback on Thai strings
- [ ] Convert all headings to sentence case
- [ ] Mobile: doodles scale down or drop, never overlapping body copy
