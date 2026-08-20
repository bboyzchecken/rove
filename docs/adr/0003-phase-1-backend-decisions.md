# 0003 — Phase 1 backend decisions

- **Date:** 2026-08-20
- **Status:** accepted
- **Relates to:** DEV_SPEC §6 (backend conventions), §16 (Decision Log)

Decisions taken while building the Phase 1 API that DEV_SPEC left open, or that
deviate from it. Each one is recorded here because §0 requires it before the
code lands.

## 1. AI tools are resolved before the call, not during it

DEV_SPEC §6.3 lists five tools (`lookup_poi`, `get_poi`, `distance`, `weather`,
`fx`) and forbids the model from stating any fact that did not come through
them. It does not say the model must call them itself.

We resolve those facts **before** the completion and inject them as a `facts`
block in the prompt.

**Why.** A tool-use loop is five or more round trips per generation. On a plan
that already retries and repairs twice, that is minutes of latency and several
times the token spend, against a per-trip daily cost cap of a few dollars. The
guarantee is identical either way — every fact in the prompt came from a real
service — and the deterministic validator (`pkg/domain/validate.go`) re-checks
opening hours and travel times against the catalogue afterwards regardless of
what the model said.

**Revisit when** a generation needs facts it cannot know in advance (e.g. the
model wants distances between two POIs it only chose mid-plan). At that point
the loop becomes worth its cost.

## 2. PDF export goes through Gotenberg, not chromedp

DEV_SPEC §2.2 leaves the choice to T10.4.

**Gotenberg**, as an opt-in compose profile.

**Why.** `chromedp` puts a full Chrome inside the API image: roughly 400 MB and
a large amount of RAM at render time, on a 2 GB box that also runs MySQL, Redis
and Next.js. Gotenberg is one HTTP call to a container that only has to exist
when PDF export is enabled, and `GOTENBERG_URL` being empty is a supported
state — export falls back to HTML rather than failing.

## 3. Export is synchronous; the job queue is for AI only

DEV_SPEC §5.11 shapes export as a job (`POST /export -> {job_id}`).

Export returns the signed URL directly.

**Why.** A seven-day plan renders in well under a second — it is a Go template
over data already in memory. A job id plus a polling UI is more machinery than
the feature needs, and it would put export failures in the same place users look
for AI failures. The queue stays reserved for the calls that genuinely take
minutes. The response shape still carries `url` and `expires_in`, so moving it
back onto the queue later is additive.

## 4. Email is Resend, not the Gmail API

DEV_SPEC §2.2 offers either.

**Resend.**

**Why.** Gmail needs an OAuth consent screen and a refresh token per sending
address — a lot of moving parts for the handful of invite fallbacks Phase 1
sends. An unset `RESEND_API_KEY` skips sending entirely rather than failing the
invite, because the invite link is already in the response and the UI copies it
to the clipboard.

## 5. Sort order is dense and renumbered, not fractional

Items carry `sort_order` as a dense `0..n-1` sequence per day, renumbered on
every move.

**Why.** A day holds roughly ten items, so renumbering costs one small update
per item and removes the whole class of "fractional index ran out of precision
after N drags" bugs. Fractional indexing earns its complexity at thousands of
siblings, not ten.

## 6. Undo consumes its snapshot

`item_versions` is written **before** each mutation, and `POST /items/:id/undo`
pops the most recent row and deletes it.

**Why.** Consuming the snapshot makes repeated undos walk backwards through
history, which is what "undo" means to a user. Leaving it in place would make
the second undo a no-op. `Save()` covers both undo-of-edit and undo-of-delete,
since it inserts when the row is gone and updates when it is not.

## 7. Coverage is recomputed live on read

`GET /coverage` recomputes from the current plan rather than reading the stored
`wishlist_items.coverage` column.

**Why.** The stored column is a cache for list views; recomputing on read means
the Coverage Board is never stale after a manual item edit, and A3.5's
"recompute after items change" hook becomes an optimisation rather than a
correctness requirement.

## 8. Non-trip-scoped routes resolve their trip first

DEV_SPEC §5 addresses several routes by a child id (`/plans/:planId`,
`/items/:itemId`, `/expense/:id`). Each is wrapped in `ResolveTrip`, which maps
the child id to its owning trip and then runs the ordinary
`TripRoleMiddleware`.

**Why.** §4.3 requires every trip-scoped query to carry a `tripID`. Rather than
writing a second authorization path for these routes, the resolver returns only
an id — never content — so one implementation covers both route shapes and a
guessed id leaks nothing beyond "not yours".

## 9. Expense privacy is structural, not configurable

`trips.public_hide_expense` exists and is always true. `public.handler.go`
contains no code path that reads the expense tables at all.

**Why.** DEV_SPEC §4.3 states expense is hidden on every public trip. Making
that a flag the payload builder consults leaves a bug waiting to happen; making
it structural means the leak cannot be introduced by flipping a value.

## 10. Rate limiting is a fixed window

Per-user when authenticated, per-IP otherwise, one Redis `INCR` per request.

**Why.** A fixed window can let through up to 2× the limit across a boundary. For
protecting an AI budget and a 2 GB box that is acceptable, and it costs one
integer instead of a sorted set per requester. The AI endpoints carry a second,
harder guard anyway: the per-trip daily USD cap read from `ai_jobs`.

## 11. POI coordinates are left blank rather than guessed

Seed rows in `data/poi/jp.csv` carry `lat`/`lng` only where the location is
known with confidence; the rest are empty until the Google enrichment pass
(D0.4).

**Why.** A wrong coordinate does not fail loudly — it silently corrupts every
travel-time check and every zone grouping that touches that point. An empty one
simply skips the travel-realism rule, which is the honest behaviour.
