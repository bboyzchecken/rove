# ADR 0003 — Phase 1 build decisions

Status: accepted · 2026-08-20

Phase 1 turned a UI prototype into a working product. Five decisions were made
along the way that a future reader would otherwise have to reverse-engineer from
the code.

## 1. One repository interface, two implementations, chosen by env

`NEXT_PUBLIC_DATA_MODE=mock|live` picks between `lib/data/mock` (browser-
persisted seed data) and `lib/data/live` (the Go API). Everything above that
line — hooks, components, pages — imports `repo` and cannot tell which answered.

**Why.** UAT has to be runnable before the backend, the database, the model and
the OAuth apps all exist at once, and a demo that is a separate codebase rots.
Both implementations satisfy the same TypeScript interface, so a flow that works
in mock mode works live; the parts that genuinely need a third party are
simulated behind `mockSkips` and labelled on screen rather than faked silently.

The Go API has the same switch: `MOCK_MODE=true` keeps MySQL real and replaces
Anthropic, Google, FX, weather, storage and e-mail with deterministic
stand-ins. `Config.UseMock()` ignores it in production, because
`MOCK_MODE=true` there is a misconfiguration, not an instruction.

## 2. Domain rules are written twice, on purpose

`apps/web/lib/data/domain.ts` and `apps/api/pkg/domain/*.go` implement the same
window search, coverage matching, budget rollup and settle-up. The test files
pin the same numbers on both sides (`domain.test.ts` ↔ `dates_test.go`,
`expense_test.go`).

**Why.** Mock mode has to compute locally to be playable offline, and the API
has to compute server-side to be authoritative. The alternative — shipping the
rules as WASM, or making mock mode call the API — costs more than the
duplication and makes the browser bundle or the UAT setup worse. The duplication
is bounded (five pure functions), and the paired tests are what keep it honest.

## 3. Exports stream; they do not go through a bucket

`POST /trips/:id/export` returns the file directly with a `Content-Disposition`
header. R2 stays in `pkg/services/storage` behind `Configured()`, unused.

**Why.** A trip export is a few kilobytes the user asked for and downloads
immediately. Uploading it first adds a signing key, a lifecycle policy and a
failure mode to a problem nobody has. "PDF" is the print dialog on a
self-contained HTML page for the same reason: a headless renderer is a service
to run, and the page it would render is that one. Phase 2 (photos, OG images)
brings a real bucket with it.

## 4. No queue and no e-mail in Phase 1

`pkg/services/jobs` was deleted. AI drafting runs in `ai.Runner`, an in-process
pool of three with the job row as its state. `pkg/services/email` logs what it
would have sent.

**Why.** One instance, a handful of concurrent drafts, and a job row that
already survives a restart as `queued`. A Redis queue would be infrastructure
with no load behind it. Invites are links pasted into a LINE chat, the paywall
is in-app, and OAuth means no password to reset — so there is no transactional
e-mail to send. Both are behind interfaces the day that changes.

## 5. Date coordination is a first-class step, not a field

A trip can exist with no dates at all. `trips.dates_locked_at` is what
separates "we agreed on these days" from "someone typed a guess into the
frame", and `/t/:id/dates` is a tab rather than a dialog.

**Why.** The entry flow assumed the group already knew when they were going,
which is the one thing a group chat never knows. Making it a step gives the
availability marks somewhere to live, gives the destination suggestion a length
to reason about, and gives the bottom bar a reason to point at a trip *list*
rather than a single trip it cannot name.

## Known gaps

- The POI catalogue has 91 rows, not the 300 in D0.3. They are real places with
  real coordinates; getting to 300 by hand would mean inventing data the AI is
  then allowed to quote. D0.4 (Google Places enrichment) is the way to scale it.
- No deployed environment yet (A0.10): `deploy/` is written and the compose
  stack boots in CI, but nothing has been provisioned on Lightsail.
