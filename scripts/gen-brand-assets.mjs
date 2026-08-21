#!/usr/bin/env node
/**
 * Regenerate ROVE's illustrated brand assets with Black Forest Labs FLUX.
 *
 *   BFL_API_KEY=... node scripts/gen-brand-assets.mjs [--only characters|scenes]
 *
 * Writes 1024px+ PNGs to `.assets-raw/`, then — if `sharp` can be resolved —
 * resizes and re-encodes them into `apps/web/public/`. Without sharp the raw
 * PNGs are left in place and the copy step is skipped.
 *
 * The wordmark and the compass mark are NOT generated: they are hand-authored
 * SVG (DEV_SPEC §15) so they stay crisp at favicon size.
 */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, '.assets-raw');
const WEB = path.join(ROOT, 'apps/web');
const KEY = process.env.BFL_API_KEY;
const MODEL = 'flux-2-pro';
const SEED = 70_000; // fixed so re-runs stay in the same visual family

/** One paragraph, appended to every prompt — this is what keeps separate
 *  generations looking like one set (DEV_SPEC §15 Visual Direction). */
const STYLE =
  'Bold flat vector illustration, bright playful palette using terracotta #D9714E, espresso brown #3D2B24, matcha green #8BC99A, sky blue #A8D4F0, sun yellow #F0E06B, lavender #C4B8E8 and pure white. Chunky geometric shapes with generously rounded corners, thick confident forms, crisp flat colour fills, no outlines, no gradients, no drop shadows, no texture, no text or lettering anywhere. Modern sticker-app illustration style, clean and graphic, consistent series look.';

/** Each character sits on its own flat colour tile, so the avatar is a colour
 *  block in the UI without needing transparency (FLUX cannot output alpha).
 *  Keep these in sync with `accent` in apps/web/lib/mock/characters.ts. */
const TILE = {
  primary: '#F7D9D2',
  matcha: '#BFE3C8',
  sky: '#C8E5F6',
  sun: '#F7EFA8',
  joyfull: '#DCD5F1',
};

const ANIMALS = [
  ['shiba', 'a shiba inu dog', 'primary'],
  ['cat', 'a chubby orange cat', 'sun'],
  ['red-panda', 'a red panda', 'primary'],
  ['bear', 'a small round bear', 'sun'],
  ['rabbit', 'a rabbit with long floppy ears', 'joyfull'],
  ['fox', 'a fox', 'primary'],
  ['penguin', 'a penguin', 'sky'],
  ['owl', 'a round owl', 'sun'],
  ['deer', 'a baby deer with tiny antlers', 'primary'],
  ['hedgehog', 'a hedgehog', 'joyfull'],
  ['capybara', 'a capybara', 'matcha'],
  ['koala', 'a koala', 'sky'],
  ['panda', 'a giant panda', 'matcha'],
  ['tiger', 'a tiger cub', 'sun'],
  ['otter', 'a sea otter', 'sky'],
  ['whale', 'a small blue whale', 'sky'],
  ['frog', 'a green frog', 'matcha'],
  ['sheep', 'a fluffy sheep', 'joyfull'],
  ['raccoon', 'a raccoon', 'matcha'],
  ['turtle', 'a turtle', 'matcha'],
];

const characters = ANIMALS.map(([slug, desc, accent], i) => ({
  name: `char-${String(i + 1).padStart(2, '0')}-${slug}`,
  width: 1024,
  height: 1024,
  prompt: `A cute mascot avatar of ${desc}, front facing, head and shoulders, centered, filling most of the frame with a small even margin, minimal face made of two small dot eyes and a tiny smile. The entire background is one flat solid colour ${TILE[accent]} filling the whole square edge to edge, no vignette, no border, no circle, no shadow. ${STYLE}`,
}));

const scenes = [
  {
    name: 'hero-landing',
    width: 1440,
    height: 816,
    prompt: `A wide banner illustration of friends travelling the world together: a diverse group of four young travellers with backpacks and a rolling suitcase walking to the right across the lower third, and behind them a light playful skyline mixing landmarks from different continents — a pagoda roof, a European clock tower, a desert arch, a tropical palm, a snowy peak — spaced apart on a pure white background. A dotted travel route curves through the scene with a few small map pins and a tiny plane. Bright, graphic, optimistic. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-japan',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a Japan trip card: a torii gate, a five story pagoda, a shinkansen train, maple leaves. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-korea',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a South Korea trip card: a hanok tiled roof, Seoul tower on a hill, cherry trees, a street food cart. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-vietnam',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a Vietnam trip card: limestone karst islands in a bay, a wooden boat with a sail, a conical hat, lanterns strung above. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-thailand',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a Thailand trip card: green mountain layers with morning mist, a longtail boat, palm trees, a small temple spire. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-iceland',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for an Iceland trip card: northern lights ribbons over snowy hills, a small glass cabin, a waterfall, a lone pine. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-europe',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a Europe trip card: pastel row houses along a canal, a clock tower, a tram, a bicycle leaning on a railing. Pure white background. ${STYLE}`,
  },

  /* The vibe covers. The six above are destinations we happen to have drawn;
     these are what a trip *feels* like, which is the only thing we know about
     a trip to somewhere we never illustrated. They are what the cover picker
     offers, and `cover-placeholder` is what every new trip starts with —
     neutral on purpose, so a trip with no cover yet does not look like it is
     going to Japan. */
  {
    name: 'cover-placeholder',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a trip card that has no cover picked yet: a folded paper map lying at a slight angle with a dotted route curving across it, three small map pins along the route, a compass beside it and a tiny plane above. Nothing that names a destination, calm and balanced, generous empty space. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-beach',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a beach trip card: a small island with two palm trees, layered wave lines, a striped beach umbrella with a ring float beside it, a little sailboat on the horizon. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-mountain',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a hiking trip card: layered mountain peaks with pine trees, a winding trail, a small tent and a backpack resting beside it, a sun disc behind the peaks. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-city',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a city trip card: a cluster of tall rounded buildings at different heights, a bridge in front of them, a tram on a street with a few round street trees. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-roadtrip',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a road trip card: a rounded car with luggage strapped on the roof driving along a curving road that runs into low rolling hills, a signpost and two road markers beside it, small clouds above. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-snow',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a snow trip card: snowy hills with pine trees, a cable car cabin hanging on a line, a small wooden lodge with a round window, a few falling snowflakes. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-desert',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a desert trip card: layered sand dunes, a camel walking to the right, one lone palm tree, a large plain sun disc low in the sky. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-food',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a food trip card: a bowl of noodles with chopsticks resting across it, a grilled skewer, a coffee cup, and a small food cart with a striped awning behind them. Pure white background. ${STYLE}`,
  },
  {
    name: 'cover-festival',
    width: 1200,
    height: 800,
    prompt: `A simple flat illustration for a festival trip card: paper lanterns strung across the top, two firework bursts, a small stage tent, confetti pieces scattered around. Pure white background. ${STYLE}`,
  },
  {
    name: 'empty-wishlist',
    width: 1024,
    height: 1024,
    prompt: `A small empty-state illustration: an open notebook page with a few blank bullet lines, a pencil resting on it, and one map pin standing beside it. Lots of empty space, very simple, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'empty-plan',
    width: 1024,
    height: 1024,
    prompt: `A small empty-state illustration: a folded paper map with a dotted route that stops halfway, a compass lying next to it. Lots of empty space, very simple, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'empty-expense',
    width: 1024,
    height: 1024,
    prompt: `A small empty-state illustration: an empty paper receipt curling at the end, a coin and a small coin purse beside it. Lots of empty space, very simple, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'empty-dream',
    width: 1024,
    height: 1024,
    prompt: `A small empty-state illustration: a hot air balloon floating above three tiny clouds and a distant mountain, a single star above it. Lots of empty space, very simple, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'empty-members',
    width: 1024,
    height: 1024,
    prompt: `A small empty-state illustration: three empty circular avatar frames drawn as dashed outlines, with one small plus sign badge. Lots of empty space, very simple, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'status-404',
    width: 1024,
    height: 1024,
    prompt: `A small illustration for a "page not found" screen: a folded paper map with a dotted route that curls into a question mark, a signpost beside it whose three arrow boards are blank and point different ways, one map pin lying on its side. Lots of empty space, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'status-error',
    width: 1024,
    height: 1024,
    prompt: `A small illustration for an "something went wrong" screen: an open suitcase tipped onto its side with a camera, a sock and a guidebook spilling out, a compass lying nearby with its needle bent. Calm and gently funny, not alarming. Lots of empty space, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'status-maintenance',
    width: 1024,
    height: 1024,
    prompt: `A small illustration for a "service temporarily unavailable" screen: a stack of two rounded server boxes with a wrench and a screwdriver resting against them, a small cloud above with an unplugged power cord dangling, three little sleep marks. Calm, reassuring, not alarming. Lots of empty space, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'status-terms',
    width: 1024,
    height: 1024,
    prompt: `A small illustration for a terms of service page: an open document sheet with a few text lines and a checklist of three ticked boxes, a pen resting diagonally across it, a small round stamp beside it. Lots of empty space, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'status-privacy',
    width: 1024,
    height: 1024,
    prompt: `A small illustration for a privacy policy page: a rounded padlock standing in front of a small suitcase, a shield outline behind them, one little key lying flat in front. Lots of empty space, centered, pure white background. ${STYLE}`,
  },
  {
    name: 'og-default',
    width: 1200,
    height: 630,
    prompt: `A wide banner illustration with a large empty white area on the left two thirds for text to be placed later, and on the right a vignette of a paper map with a dotted travel route, three map pins, a small globe and a tiny plane. No text or lettering anywhere. Pure white background. ${STYLE}`,
  },
];

/* --------------------------------------------------------------- generate -- */

async function generate(job) {
  const res = await fetch(`https://api.bfl.ai/v1/${MODEL}`, {
    method: 'POST',
    headers: { 'x-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: job.prompt,
      width: job.width,
      height: job.height,
      seed: SEED,
      output_format: 'png',
      safety_tolerance: 2,
    }),
  });
  if (!res.ok) throw new Error(`${job.name}: submit ${res.status} ${await res.text()}`);
  const { polling_url: pollingUrl } = await res.json();

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1_500));
    const poll = await fetch(pollingUrl, { headers: { 'x-key': KEY, Accept: 'application/json' } });
    const body = await poll.json();
    if (body.status === 'Ready') {
      const image = Buffer.from(await (await fetch(body.result.sample)).arrayBuffer());
      await fs.writeFile(path.join(RAW, `${job.name}.png`), image);
      console.log(`generated ${job.name}`);
      return;
    }
    if (body.status !== 'Pending' && body.status !== 'Request Accepted') {
      throw new Error(`${job.name}: ${body.status}`);
    }
  }
  throw new Error(`${job.name}: timed out`);
}

/* --------------------------------------------------------------- optimise -- */

/** Where each family lands in the app, and how big it is allowed to be. */
const PLACEMENT = [
  { match: /^char-/, dir: 'public/characters', width: 320, height: 320 },
  { match: /^cover-/, dir: 'public/brand/covers', width: 1200 },
  { match: /^empty-/, dir: 'public/brand/empty', width: 480 },
  { match: /^status-/, dir: 'public/brand/status', width: 480 },
  { match: /^hero-/, dir: 'public/brand', width: 1440 },
  { match: /^og-/, dir: 'public/brand', width: 1200, format: 'png' },
];

async function optimise() {
  // sharp is not a project dependency — it is only needed to re-cut assets.
  // A bare import covers a global or hoisted install; otherwise SHARP_PATH (a
  // directory whose node_modules has sharp) and apps/web are tried through
  // createRequire, because sharp is CommonJS and an absolute Windows path is
  // not an importable specifier.
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    for (const root of [process.env.SHARP_PATH, WEB].filter(Boolean)) {
      try {
        const require = createRequire(pathToFileURL(path.join(root, 'resolve.cjs')));
        sharp = require('sharp');
        break;
      } catch {
        /* try the next location */
      }
    }
  }
  if (!sharp) {
    console.log(
      '\nsharp not found — raw PNGs are in .assets-raw/, nothing copied.' +
        '\nInstall it anywhere and re-run with' +
        ' SHARP_PATH=<dir> (a folder whose node_modules has sharp).'
    );
    return;
  }

  const wanted = new Set(jobs.map((job) => `${job.name}.png`));
  for (const file of await fs.readdir(RAW)) {
    if (!wanted.has(file)) continue;
    const rule = PLACEMENT.find((p) => p.match.test(file));
    if (!rule) continue;

    const base = file.replace(/\.png$/, '');
    const dir = path.join(WEB, rule.dir);
    await fs.mkdir(dir, { recursive: true });

    const img = sharp(path.join(RAW, file)).resize({
      width: rule.width,
      height: rule.height,
      fit: 'cover',
      withoutEnlargement: true,
    });

    const ext = rule.format === 'png' ? 'png' : 'webp';
    const info = await (ext === 'png' ? img.png({ compressionLevel: 9 }) : img.webp({ quality: 80 }))
      .toFile(path.join(dir, `${base}.${ext}`));
    console.log(`${rule.dir}/${base}.${ext}  ${(info.size / 1024).toFixed(0)}KB`);
  }
}

/* ------------------------------------------------------------------- main -- */

if (!KEY) {
  console.error('BFL_API_KEY is not set — it lives in the repo root .env');
  process.exit(1);
}

const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;
/** `--match status-` re-cuts one family without paying for the whole set. */
const match = process.argv.includes('--match')
  ? new RegExp(process.argv[process.argv.indexOf('--match') + 1])
  : null;

const jobs = (
  only === 'characters' ? characters : only === 'scenes' ? scenes : [...characters, ...scenes]
).filter((job) => !match || match.test(job.name));

if (jobs.length === 0) {
  console.error('nothing matched — check --only / --match');
  process.exit(1);
}

await fs.mkdir(RAW, { recursive: true });

// Four at a time: BFL queues per-key anyway, and this keeps failures readable.
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try {
        await generate(job);
      } catch (error) {
        console.error(String(error.message ?? error));
      }
    }
  })
);

await optimise();
