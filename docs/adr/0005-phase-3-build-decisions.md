# ADR 0005 — Phase 3 build decisions

Status: accepted · 2026-08-25

Phase 3 turned a working product into one with a public side that ranks, a
copy that adapts, an aftermath that is honest about money, and a second
country. Six decisions are worth writing down, because each one looks like a
shortcut until you know what the alternative cost.

## 1. "AI auto-adapt" adapts without a model

A11.4 asks for an AI that reshapes a copied plan to a different group's dates,
size and budget. `pkg/domain/adapt.go` does it with rules and no model call.

**Why.** The feature ships a *preview*: it shows what will change before
anything is written, and then writes exactly that. A model cannot promise the
two runs agree. And the work itself is arithmetic, not judgement — drop the
quietest interior day, move its highlights into a day with room, cut the
priciest optional stop until the budget is met, never cut the hotel or the
meals. Doing it in Go means it also runs offline, runs in mock mode, and can be
unit tested to the baht; `lib/data/domain.ts` carries the twin and the two test
files pin the same fixtures.

The model still owns what models are good at: drafting a plan from nothing
(A4.x) and generating variants (A6.2). Adapting an existing one is not that.

## 2. Ranked explore is scored in Go over a window

`GET /public/explore?match=<tripId>` fetches the 200 most popular public trips,
scores each against the caller's own trip and sorts in memory.

**Why.** The score depends on who is asking — their dates, budget, party size
and interests — so it cannot be a column or an index. The honest options were a
materialised score per (viewer, trip) pair, which is a cache invalidation
problem for a catalogue of dozens, or a window. The window won, and the
response says so: it returns `scored`, the size of what was actually ranked, so
nobody reads the feed as if it covered the whole table. When public trips pass
a couple of hundred, that constant is the thing to change, and the response
already tells you when you have got there.

## 3. Reviews are not the expense ledger

`trip_reviews` carries a rating and one number: what the trip actually cost per
person. `expense_entries` — the group's real accounting — still never appears in
any public payload, and there is a test that says so.

**Why.** The most useful thing a published plan can say is "the estimate was
฿45,000 and we spent ฿52,000". The most damaging thing it can do is publish who
paid for dinner. Those are two different facts, and keeping them in two tables
is what makes the first one safe to show. The review figure is self-reported and
per-person, the reviewer chose to publish it, and the average counts only the
people who gave one — averaging over everybody would quietly report a cheaper
trip than anyone had.

## 4. Points and creator earnings are separate currencies

`user_points` is a loyalty score this product mints. `creator_earnings` is money
a partner owes, in baht, that eventually leaves the company bank account. A
confirmed booking writes both.

**Why.** They behave differently in every way that matters: points are spent
in-app and cost nothing to issue, earnings are a liability with a payout, a
minimum transfer and a tax story. Mixing them would make "what do we owe
creators this month" a question about a game score. Redemption is the one bridge
(A12.10) and it runs one way at a published rate: 8 points to the baht, derived
from the price the product already has — a draft is 300 points or ฿39, so
redeeming can never beat spending points directly.

Commission reported by a partner always wins, including a reported zero.
Anything derived from the rate table is flagged `estimated`, and the payout
report shows the flag, because paying out on an estimate is a decision somebody
has to make on purpose.

## 5. Trip Mode is a screen, offline is a snapshot

`/t/:id/now` answers three questions — what now, what next, how do I get there —
and keeps answering them with no signal. The service worker caches the app
shell; `lib/offline.ts` keeps one trip's itinerary in localStorage.

**Why.** Persisting the whole TanStack Query cache would have been one line and
would have put expenses, member lists and every other room's data on the device
to solve a problem that is one day's plan. Navigation is handed to Google Maps
for the same reason: turn-by-turn is a product, not a feature, and the phone
already has one that knows about the Yamanote line.

## 6. The AI worker splits by role, not by rewrite

`ROVE_ROLE=api|worker|all`. The API pushes an envelope onto a Redis list; the
worker pops it and runs the same in-process pool the single binary always ran.
`all` remains the default and is what a laptop and docker compose use.

**Why.** What changed is not the load, it is the shape: a draft takes up to
three minutes and a deploy takes seconds, so every release either waited for the
drafts or killed them. Split, the web tier restarts on its own schedule and the
worker can run entirely on Fargate Spot, because an evicted draft is still
`queued` in `ai_jobs` and gets picked up again.

It is a list and not a broker because the job already has a home: everything
durable lives in `ai_jobs`, so the queue carries an envelope and the failure
mode of losing it is "drafts stay queued" — a state the product already has a
name and a screen for. And when Redis cannot be reached, the API runs the draft
itself rather than dropping it: a credit has already been spent by then, and
slow is better than gone.

## 7. What Phase 3 did not finish

The second country is done — Korean zones, a Seoul POI catalogue, Korean prep
rules, and the API picking all three from `destination_country`.

English is not, and the locale plumbing here is **provisional**. What shipped is
option A of [docs/i18n-plan.md](../i18n-plan.md): a cookie-scoped locale, a
server action to set it, a switcher, and `messages/en.json`. That plan makes the
case for option B instead — a `[locale]` segment with `localePrefix:
'as-needed'` — on the grounds that explore, `/p/[slug]` and `/u/[handle]` are
the pages an English speaker meets first and a single URL per page means SEO in
one language only. That decision (D1 in the plan) has not been made, and it is
not one to make in passing: it moves the whole app tree under `app/[locale]/`.

Nothing here blocks it. `messages/`, the switcher and the `locales.ts` constants
survive either choice; only `i18n/request.ts` is replaced, by
`routing.ts`/`navigation.ts`/`middleware.ts`.

The rest of the work is unchanged either way: roughly 1,300 lines of Thai copy
in components, plus the API's error strings, still have to be extracted into
keys. Until they are, the switcher says on screen that only the menus are
translated, rather than delivering a half-English app quietly.

The i18n plan asks for its own ADR at 0005; that number is taken by this
record, so it should be 0006.
