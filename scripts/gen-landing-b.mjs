/**
 * Photos for landing page B (Feedback #2 — D-17, F5.3).
 *
 *   BFL_API_KEY=... node scripts/gen-landing-b.mjs
 *
 * Same request/poll code as gen-brand-assets.mjs, different brief: B is the
 * editorial, photographic counterpart to the doodle page, so §7's doodle
 * prompt block is replaced by a photography one. Output lands as JPEG under
 * apps/web/public/brand/landing-b/ and next/image does the resizing; sharp is
 * not needed here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/web/public/brand/landing-b');
const KEY = process.env.BFL_API_KEY;
const MODEL = 'flux-2-pro';
const SEED = 20_260_914;

const STYLE =
  'Editorial travel photograph, natural daylight, warm neutral colour grade, soft film grain, ' +
  'shallow depth of field, candid and unposed, Southeast Asian young adults in their twenties, ' +
  'no logos, no text, no letters, no watermark, no captions, magazine quality, 35mm lens look.';

const JOBS = [
  {
    name: 'hero',
    width: 1344,
    height: 1024,
    prompt:
      'Three friends at a wooden café table planning a trip together, one phone and a paper map between them, ' +
      'a cup of coffee, morning window light, everyone leaning in and smiling at the map. ' +
      STYLE,
  },
  {
    name: 'story-plan',
    width: 1024,
    height: 1280,
    prompt:
      'A young woman alone on a train looking out of the window at rice fields and mountains, a small ' +
      'notebook and phone on the tray table, calm and content, late afternoon light. ' +
      STYLE,
  },
  {
    name: 'story-money',
    width: 1024,
    height: 1024,
    prompt:
      'Close-up over the shoulder of two friends at a street food stall at night, one holding a phone ' +
      'showing a blank screen, warm lantern light, bowls of noodles on the counter, cheerful. ' +
      STYLE,
  },
];

async function generate(job) {
  const res = await fetch(`https://api.bfl.ai/v1/${MODEL}`, {
    method: 'POST',
    headers: { 'x-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: job.prompt,
      width: job.width,
      height: job.height,
      seed: SEED,
      output_format: 'jpeg',
      safety_tolerance: 2,
    }),
  });
  if (!res.ok) throw new Error(`${job.name}: submit ${res.status} ${await res.text()}`);
  const { polling_url: pollingUrl } = await res.json();

  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 1_500));
    const poll = await fetch(pollingUrl, { headers: { 'x-key': KEY, Accept: 'application/json' } });
    const body = await poll.json();
    if (body.status === 'Ready') {
      const image = Buffer.from(await (await fetch(body.result.sample)).arrayBuffer());
      await fs.writeFile(path.join(OUT, `${job.name}.jpg`), image);
      console.log(`generated ${job.name} (${image.length} bytes)`);
      return;
    }
    if (body.status !== 'Pending' && body.status !== 'Request Accepted') {
      throw new Error(`${job.name}: ${body.status} ${JSON.stringify(body).slice(0, 200)}`);
    }
  }
  throw new Error(`${job.name}: timed out`);
}

if (!KEY) {
  console.error('BFL_API_KEY is not set — it lives in the repo root .env');
  process.exit(1);
}
await fs.mkdir(OUT, { recursive: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
await Promise.all(JOBS.filter((job) => !only || job.name === only).map(generate));
