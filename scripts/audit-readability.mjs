#!/usr/bin/env node
/**
 * Readability audit for the doodle-UI rebrand (ROVE_BRAND_SPEC).
 *
 *   node scripts/audit-readability.mjs http://localhost:3101 / /pricing /home
 *
 * The style puts marks and pills *on top of* type, which is the whole point of
 * §4 and §6 — and also the thing that quietly breaks a page. Hand-checking
 * thirty routes at two viewports is not something anyone does twice, so the
 * rules that matter are checked mechanically instead:
 *
 *   overBody      a doodle or tilted tag intersecting text under 20px. §5.3
 *                 and §9 allow an overlay on display type only.
 *   overKnockout  anything painting *above* the knockout word (§4.2.7). Marks
 *                 behind it are ignored — it is an opaque block, so being
 *                 behind it is invisible, not a collision.
 *   tagIntrusion  a tilted tag with more than 45% of itself over the headline.
 *                 Overlapping display type is the effect, so overBody stays
 *                 quiet about it; a pill across the middle of a word is not
 *                 (§4.2.4, edge of a letter).
 *   contrast      every text node against the colour actually painted behind
 *                 it, at the AA threshold for its size and weight (§2.2).
 *   weights       600 and 800 are not loaded and 700 is the hero's alone
 *                 (§3.3), so anything else is synthesised or off-spec.
 *   overflow      a page wider than its own viewport.
 *
 * Findings land in $AUDIT_OUT as JSON; the console prints only what failed.
 *
 * Two details worth keeping. Colours are normalised through a canvas 2D
 * context, because Tailwind emits `oklab()` for anything with an opacity
 * modifier and a regex over the digits reads that as an rgb triple. And the
 * background is sampled from `elementsFromPoint` — the real paint stack —
 * because walking parents cannot see what an absolutely positioned header is
 * floating over, which reported the white wordmark on the hero canvas as
 * white-on-cream.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
// Playwright is a devDependency of the web app, not of the repo root.
const require = createRequire(new URL('../apps/web/x.cjs', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = process.argv[2];
const ROUTES = process.argv.slice(3);

const IN_PAGE = () => {
  // Tailwind emits oklab() for any colour carrying an opacity modifier, and a
  // regex over the digits read that as an rgb triple — which is how muted ink
  // on white came back as a 3.19 failure. A 2D context normalises every CSS
  // colour form to rgba, so let the browser do the parsing.
  const _cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  _cx.canvas.width = _cx.canvas.height = 1;
  const rgb = (s) => {
    if (!s || s === 'transparent' || s === 'none') return null;
    _cx.clearRect(0, 0, 1, 1);
    _cx.fillStyle = '#000';
    _cx.fillStyle = s;
    const resolved = _cx.fillStyle;
    _cx.fillRect(0, 0, 1, 1);
    const d = _cx.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return null;
    void resolved;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  let _bgFrom = '';
  const desc = (n) => n ? `${n.tagName.toLowerCase()}.${String(n.className || '').split(' ').slice(0,4).join('.')}` : '?';
  const bgOf = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const inView = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
    if (!inView) {
      // Below the fold: clamping the sample to the viewport edge read whatever
      // was painted there instead, which is how a canvas-blue button came back
      // as white-on-white. Fall through to the parent walk.
      let n = el;
      while (n && n !== document.documentElement) {
        const p = rgb(getComputedStyle(n).backgroundColor);
        if (p && (p[3] === undefined || p[3] > 0.6)) return p.slice(0, 3);
        n = n.parentElement;
      }
      return [255, 252, 241];
    }
    // elementsFromPoint is the paint stack, so it sees what is actually behind
    // an overlay — a parent walk cannot, and reported the white wordmark on the
    // hero canvas as white-on-cream.
    for (const n of document.elementsFromPoint(x, y)) {
      // A descendant is painted *by* this element, not behind it. Without this
      // the hero h1's centre landed on its own knockout block and reported
      // white-on-white at 96px.
      if (n !== el && el.contains(n)) continue;
      // A fixed/sticky overlay (the FAB, the bottom nav) floats *over* content;
      // it is an occluder, not the text's background. Sampling it reported the
      // paragraph underneath as low contrast when nothing was wrong with it.
      if (n !== el && !n.contains(el)) {
        // Walk up: the mobile FAB is a static span inside a fixed nav, so
        // checking only the hit element still sampled it.
        let a = n, floating = false;
        while (a && a !== document.body) {
          const pos = getComputedStyle(a).position;
          if (pos === 'fixed' || pos === 'sticky') { floating = true; break; }
          a = a.parentElement;
        }
        if (floating) continue;
      }
      const p = rgb(getComputedStyle(n).backgroundColor);
      if (p && (p[3] === undefined || p[3] > 0.6)) { _bgFrom = desc(n); return p.slice(0, 3); }
    }
    let n = el;
    while (n && n !== document.documentElement) {
      const p = rgb(getComputedStyle(n).backgroundColor);
      if (p && (p[3] === undefined || p[3] > 0.6)) return p.slice(0, 3);
      n = n.parentElement;
    }
    return [255, 252, 241];
  };
  const zOf = (el) => { let n = el, z = 0; while (n && n !== document.body) { const v = parseInt(getComputedStyle(n).zIndex, 10); if (!Number.isNaN(v)) { z = v; break; } n = n.parentElement; } return z; };
  const inter = (a, b) => { const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return x * y; };
  const label = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 42);

  // Every element that directly owns visible text.
  const texts = [...document.querySelectorAll('body *')].filter((el) => {
    if (!vis(el)) return false;
    if (el.closest('[data-nextjs-toast], nextjs-portal, #__next-build-watcher')) return false;
    // A tilted tag is an overlay, not body copy. Counting it as copy made
    // every tag report itself and its neighbours as an overlap.
    if (el.closest('[data-tilted-tag]')) return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  });

  const doodles = [...document.querySelectorAll('svg.doodle')].filter(vis);
  const tags = [...document.querySelectorAll('[data-tilted-tag]')].filter(vis);
  const knockouts = [...document.querySelectorAll('.knockout')].filter(vis);

  const out = { overBody: [], overKnockout: [], tagIntrusion: [], contrast: [], weights: [], overflow: null };

  // §4.2.4 — a tag clips the *edge* of a letter. Overlapping display type is
  // allowed and is the whole effect, so the overBody check below says nothing
  // about it; what makes a headline unreadable is a pill parked across the
  // middle of a word. Measured as how much of the tag's own width sits over
  // the headline, which is the thing the eye actually reads as "covered".
  for (const tag of tags) {
    const tr = tag.getBoundingClientRect();
    for (const h of document.querySelectorAll('h1')) {
      const hr = h.getBoundingClientRect();
      const w = Math.max(0, Math.min(tr.right, hr.right) - Math.max(tr.left, hr.left));
      const vOverlap = Math.max(0, Math.min(tr.bottom, hr.bottom) - Math.max(tr.top, hr.top));
      if (vOverlap < 4 || tr.width === 0) continue;
      const share = w / tr.width;
      if (share > 0.45) {
        out.tagIntrusion.push({ tag: label(tag), share: +share.toFixed(2) });
      }
    }
  }

  for (const t of texts) {
    const size = parseFloat(getComputedStyle(t).fontSize);
    const weight = Number(getComputedStyle(t).fontWeight) || 400;
    const tr = t.getBoundingClientRect();

    // §5.3 / §9 — a mark may cross display type, never body copy.
    if (size < 20) {
      for (const d of [...doodles, ...tags]) {
        if (d.contains(t) || t.contains(d)) continue;
        const a = inter(tr, d.getBoundingClientRect());
        if (a > 24) out.overBody.push({ text: label(t), size, mark: d.tagName === 'svg' ? 'doodle' : 'tag', markText: label(d), area: Math.round(a) });
      }
    }

    // §3.3 — content screens carry 400/500; 700 is the hero's alone. 600/800
    // are not loaded at all, so they synthesise.
    if (weight === 600 || weight === 800) out.weights.push({ text: label(t), weight, size });
    else if (weight >= 700 && !t.closest('.t-hero')) out.weights.push({ text: label(t), weight, size, note: 'bold outside hero' });

    const fg = rgb(getComputedStyle(t).color);
    if (fg) {
      const bg = bgOf(t);
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const r = ratio(fg.slice(0, 3), bg);
      if (r < (large ? 3 : 4.5)) out.contrast.push({ text: label(t), size, weight, ratio: +r.toFixed(2), fg: `rgb(${fg.slice(0, 3)})`, bg: `rgb(${bg})`, bgFrom: _bgFrom });
    }
  }

  // §4.2.7 — the knockout word stays clean.
  for (const k of knockouts) {
    const kr = k.getBoundingClientRect();
    const kz = zOf(k);
    for (const d of [...doodles, ...tags]) {
      if (zOf(d) <= kz) continue;
      const a = inter(kr, d.getBoundingClientRect());
      if (a > 16) out.overKnockout.push({ knockout: label(k), mark: label(d) || 'doodle', area: Math.round(a) });
    }
  }

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    out.overflow = { scrollWidth: document.documentElement.scrollWidth, inner: window.innerWidth };
  }
  return out;
};

const browser = await chromium.launch();
const report = {};
for (const route of ROUTES) {
  report[route] = {};
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(700);
      const r = await page.evaluate(IN_PAGE);
      r.status = res?.status();
      if (errors.length) r.pageErrors = errors;
      report[route][name] = r;
    } catch (e) {
      report[route][name] = { failed: String(e).slice(0, 160) };
    }
    await page.close();
  }
}
await browser.close();
if (process.env.AUDIT_OUT) await fs.writeFile(process.env.AUDIT_OUT, JSON.stringify(report, null, 1));

// Console summary: only what needs fixing.
let issues = 0;
for (const [route, vps] of Object.entries(report)) {
  for (const [vp, r] of Object.entries(vps)) {
    if (r.failed) { console.log(`FAIL  ${route} ${vp}  ${r.failed}`); issues++; continue; }
    const bits = [];
    if (r.overBody?.length) bits.push(`overBody=${r.overBody.length}`);
    if (r.overKnockout?.length) bits.push(`overKnockout=${r.overKnockout.length}`);
    if (r.tagIntrusion?.length) bits.push(`tagIntrusion=${r.tagIntrusion.length}`);
    if (r.contrast?.length) bits.push(`contrast=${r.contrast.length}`);
    if (r.weights?.length) bits.push(`weights=${r.weights.length}`);
    if (r.overflow) bits.push(`overflow=${r.overflow.scrollWidth}px`);
    if (r.pageErrors?.length) bits.push(`jsErr=${r.pageErrors.length}`);
    if (bits.length) { console.log(`${route} ${vp}  ${bits.join('  ')}`); issues += bits.length; }
  }
}
console.log(issues ? `\n${issues} issue groups — see /tmp/audit/report.json` : '\nclean');
