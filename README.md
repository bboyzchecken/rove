# `site` — the holding page at rovetravel.site

**This branch shares no history with `main`.** It is an orphan branch, and what
you are looking at is all of it: five files and no application code. If you
arrived here expecting the rove monorepo, you want `main`.

## Why it lives on its own branch

Cloudflare Pages rebuilds whenever the branch it watches moves. Put the holding
page on `main` and every commit to the app — none of which can change the
holding page — redeploys the front door and spends from the 500 builds a month
the free plan allows.

Split the other way round and each side is left alone: change the page, only the
page redeploys; change the app, only `uat` redeploys. Neither branch ever has to
be merged into the other, which is the part that would have rotted.

It also means the front door cannot be taken down by anything that goes wrong in
the app's build. That is the whole reason this page is flat HTML with no build
step, no framework and no dependencies — it must not be able to fail for any of
the reasons the app can fail.

| | |
|---|---|
| `index.html` | the page — CSS inline, one inline script for the year |
| `404.html` | sends every other path home |
| `_headers` | cache and security headers, read by Cloudflare Pages |
| `assets/` | the compass mark and the OG card |

The only thing fetched from off-origin is Google Fonts.

## Deploying

Cloudflare Pages, production branch `site`, **no build command and no build
output directory** — the files are already at the root. Full steps live on `main`
in `deploy/CLOUDFLARE.md`.

## Looking at it locally

```bash
npx serve .
```

Opening `index.html` straight off disk works too — asset paths are relative for
exactly that reason.

## Two things that look like mistakes

**Why `404.html` and not a `/* / 200` rewrite in `_redirects`.** Pages evaluates
`_redirects` *before* it looks for a matching file, and it does not support `200`
rewrites at all. A catch-all there would swallow `assets/mark.svg` and the OG
image along with everything else. Pages serves `404.html` automatically for
anything it cannot find, which gets the same result without eating the assets.

**Why the brand colours are written out as raw hex.** They are copied by hand
from `apps/web/styles/brand.css` on `main`, which stays the single source of
truth. Importing it would mean a build step, and a build step is the one thing
this page is not allowed to have. When the brand moves, this file is updated to
match — it does not get a vote.

> ⚠️ The brand is mid-move. `main` has the compass mark in terracotta
> `#D9714E`, which is what this page uses. `rebrand/doodle-v1` has already taken
> it to blue and then to black. When that rebrand lands, this page is one file to
> bring back in line — but nothing will remind you, so this note is the reminder.
