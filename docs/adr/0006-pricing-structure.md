# ADR 0006 — Price the trip, and refund it when they book

Status: accepted · 2026-08-26
Supersedes the pricing decisions of DEV_SPEC §16 dated 19 and 21 ส.ค. 2569.

## Context

Every price in the product was traced back to its origin. The result is worth
recording plainly, because it is the reason this ADR exists at all:

**฿39 was never a price.** DEV_SPEC §16 (19 ส.ค.) records the reason as
*"คุมต้นทุน Anthropic ต่อทริป"* — it answers the question "how do we stop the
model bill running away per trip", not "what should this be worth". The number
39 itself has no recorded derivation anywhere: not in the Decision Log, not in
an ADR, not in a commit message. ADR 0005 then derived the points redemption
rate from it — *"8 points to the baht, derived from the price the product
already has"* — treating ฿39 as an axiom that was never established.

**฿129/month has no recorded reasoning at all.** DEV_SPEC §16 (21 ส.ค.)
explains why the catalogue ships early (`available:false` so launch day is a
deploy, not a rebuild) and says nothing about the number.

Two structural problems follow, neither of which is about the numbers being
too high or too low:

1. **The pricing metric does not match the value metric.** People take 0.8–2
   trips a year, not one a month. A monthly plan invites exactly one behaviour:
   subscribe, finish planning inside 30 days, cancel. That is not a retention
   problem marketing can fix.

2. **The paywall stands in front of revenue 37× larger than itself.** Affiliate
   commission on a trip that ends in a booking is ฿1,200–1,700
   (`trip-planning-platform-plan.md` §9.3). Every time ฿39 stops someone
   finishing a plan, we collect ฿0 and forgo ฿1,450 in the same moment.

The original cost justification has also evaporated. The planner model moved
from opus-class to haiku-4.5, taking the cost of a draft from roughly ฿11 to
฿0.74. The two free drafts that cost ~฿22 per trip now cost ~฿1.50.

## Decision

Three tiers, priced per **trip** rather than per month:

| Tier | Price | What it is for |
|---|---|---|
| ฟรี | ฿0 | 1 active trip, 3 AI drafts, every feature |
| **Trip Pass** | **฿299 / trip** | Unlimited drafts for that trip — **refunded in full when they book through ROVE** |
| ROVE Year | ฿990 / year | Unlimited trips — creators and frequent travellers |

`฿990 = ฿299 × 3.3`, so the annual tier pays for itself at 3.3 trips a year. It
exists mainly as the reference point that makes ฿299 read as reasonable, and to
serve the creators who supply the public plans other people clone.

### Where ฿299 comes from

Four lenses, per Nagle & Müller, *The Strategy and Tactics of Pricing*:

| Lens | Value |
|---|---|
| Cost floor | ~฿6 per trip (≈8 drafts × ฿0.74) |
| Value ceiling (EVC) | ~฿2,250 (≈15 hours saved × ฿150/hr) |
| Competitive reference | Pantip ฿0 · guidebook ฿300–500 · agent-built itinerary ฿1,000–3,000 |
| Willingness to pay | **not yet measured** — Van Westendorp survey is D26.1 |

฿299 is 13% of the value ceiling, inside the 10–25% band the text recommends
for a product with no reputation behind it yet. Split across a group of four it
is ฿75 a head, and the group is the unit that decides.

The fourth lens is missing on purpose rather than by oversight: this price is
defensible from three sides today and must be re-tested against real
willingness-to-pay before it is treated as settled.

### Why the refund is the whole point

ROVE has two revenue engines that pull in opposite directions: commission wants
the maximum number of finished plans, direct revenue wants the maximum per
head. The refund removes the conflict instead of choosing a side.

```
Books through ROVE (~30%)  → refund ฿299, collect ฿1,450 commission
Books elsewhere    (~70%)  → keep ฿299, collect no commission
Expected value = (0.30 × 1450) + (0.70 × 299) = ฿644 per passed trip
```

Against roughly ฿111 per trip under the current structure, that is ~5.8×. It
also produces a sentence that is true all the way through, which the old
structure could not: *"ถ้าจองผ่านเรา คุณไม่ต้องจ่ายค่าวางแผนเลย"*.

The refund fires at most once per trip, in the same transaction as the booking
confirmation that awards points (A26.4). Ten bookings on one trip refund once.

### Launch discount, not a launch price

The list price is ฿299 from day one. Early access is a **dated discount code**
(฿99 for the first 1,000 users), never a lower list price.

The first price a customer sees becomes their permanent reference point, and a
later increase reads as "more expensive" however much the product improved. Our
earliest users arrive through an influencer audience — the segment with the
loudest voice and therefore the highest cost of being raised on. A gift that
expires and a price that goes up are the same arithmetic and different feelings.
`discount_codes` already exists from A12.10.

## Consequences

**`PointsPerBahtRedeemed = 8` loses its basis.** It was derived from 300 points
÷ ฿39. With ฿39 gone, the rate has to be re-grounded explicitly (A26.5) or it
becomes exactly the kind of unexplained constant this ADR exists to prevent.
Points themselves survive and get a larger destination: they now discount a
฿299 Trip Pass rather than a ฿39 draft, which makes referral and clone rewards
worth substantially more.

**The free tier gets more generous, deliberately.** Three drafts and one active
trip cost ~฿2 per trip to serve, against an advertising cost per user in the
tens of baht. Generosity here is the cheapest customer acquisition available.

**The daily AI cost cap must move before launch.** Unlimited drafts under a pass
will exhaust `AI_DAILY_COST_CAP_USD=5` within the first hour of launch day
(A26.6). Both `ecs.tf` and `worker.tf` carry the value and must agree.

**This ADR is provisional until D26.1 reports.** Three of the four lenses are
grounded; the one that measures what people will actually pay is not. Treating
฿299 as settled before that survey would repeat the mistake that produced ฿39.
