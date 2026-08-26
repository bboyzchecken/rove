package domain

import (
	"fmt"
	"time"
)

// Bill & Payment (M20 — A20.x).
//
// Everything the product sells becomes an *order*, whatever it was: extra AI
// drafts today, a monthly plan next. The rules that decide what an order says —
// its number, its price, whether it is on sale — live here so the handler,
// the receipt and the price list cannot each hold a different opinion.

// Order kinds. One per thing that can be sold.
//
// `ai_credit` is not sold any more — M26 replaced the per-draft paywall with a
// pass on the whole trip — but the constant stays, because receipts issued
// under it are still in the table and the billing screen still reads them.
const (
	OrderKindAICredit     = "ai_credit"
	OrderKindTripPass     = "trip_pass"
	OrderKindSubscription = "subscription"
	OrderKindPointsTopup  = "points_topup"
)

// Order statuses. `pending` exists for the day a gateway does; until then an
// order is written only once it has already succeeded.
const (
	OrderPending  = "pending"
	OrderPaid     = "paid"
	OrderFailed   = "failed"
	OrderRefunded = "refunded"
)

// How an order was paid for. `points` and `free` never reach a gateway.
const (
	PayMethodCard      = "card"
	PayMethodPromptPay = "promptpay"
	PayMethodTrueMoney = "truemoney"
	PayMethodPoints    = "points"
	PayMethodFree      = "free"
)

// PayChannel is one accepted way to pay. The id is what the receipt records and
// the label is what the user tapped; carrying them together is what stops a
// receipt saying "บัตรเครดิต" about a PromptPay charge.
type PayChannel struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// PayChannels is what the paywall accepts. Printed in the sheet rather than
// discovered after committing — finding out your method is unsupported at the
// last step is the failure this list exists to prevent.
var PayChannels = []PayChannel{
	{ID: PayMethodCard, Label: "บัตรเครดิต/เดบิต"},
	{ID: PayMethodPromptPay, Label: "พร้อมเพย์ (QR)"},
	{ID: PayMethodTrueMoney, Label: "TrueMoney Wallet"},
}

// IsCashMethod reports whether a method would move real money — which, while
// there is no gateway, is exactly the set of orders that must be flagged
// `simulated` so nothing implies a charge that did not happen.
func IsCashMethod(method string) bool {
	switch method {
	case PayMethodCard, PayMethodPromptPay, PayMethodTrueMoney:
		return true
	default:
		return false
	}
}

// NormalisePayMethod maps whatever the client sent onto a known method, so an
// unrecognised string can never end up printed on a receipt as fact.
func NormalisePayMethod(method string) string {
	switch method {
	case PayMethodCard, PayMethodPromptPay, PayMethodTrueMoney, PayMethodPoints, PayMethodFree:
		return method
	default:
		return PayMethodCard
	}
}

// PayMethodLabel is the fallback wording when a client sends an id and no
// label — a receipt always says how it was paid, in words.
func PayMethodLabel(method string) string {
	for _, channel := range PayChannels {
		if channel.ID == method {
			return channel.Label
		}
	}
	switch method {
	case PayMethodPoints:
		return "แต้ม ROVE"
	case PayMethodFree:
		return "ไม่มีค่าใช้จ่าย"
	default:
		return method
	}
}

/* --------------------------------------------------------------- numbers -- */

// ReceiptNumber renders "RV-2569-000123": the Buddhist year, then that year's
// sequence. It is what a person quotes when they write in about a charge, so it
// is short, unambiguous when spoken, and never reused.
func ReceiptNumber(issuedAt time.Time, sequence int) string {
	return fmt.Sprintf("RV-%d-%06d", issuedAt.Year()+543, sequence)
}

// ReceiptYearPrefix is the LIKE prefix the store counts with to find the next
// sequence for a year.
func ReceiptYearPrefix(issuedAt time.Time) string {
	return fmt.Sprintf("RV-%d-", issuedAt.Year()+543)
}

/* ------------------------------------------------------------------ plans -- */

// Plan ids. Three rows (M26): free, one pass per trip, and a year for people
// who travel often enough that buying passes one at a time adds up.
const (
	FreePlanID     = "free"
	TripPassPlanID = "trip_pass"
	YearPlanID     = "rove_year"
)

// Billing intervals. `trip` is not a length of time — it is the unit this
// product is actually sold in. A Thai traveller goes abroad 0.8–2 times a year,
// so a monthly plan asks them to pay for the eleven months in which they are
// planning nothing, and invites the only sensible response: subscribe, finish
// in thirty days, cancel (M26).
const (
	IntervalTrip  = "trip"
	IntervalMonth = "month"
	IntervalYear  = "year"
)

// Prices, as named constants rather than numbers typed into a struct literal:
// the paywall, the receipt and the refund all have to quote the same figure,
// and three copies of ฿39 that nobody could trace is what M26 exists to undo.
// Where these numbers come from is written down in docs/decision-log.md.
const (
	// TripPassPriceTHB unlocks one trip for everyone in its room, and is paid
	// back in full when that trip produces a booking through ROVE.
	TripPassPriceTHB = 299
	// RoveYearPriceTHB covers every trip for a year.
	RoveYearPriceTHB = 990
)

// FreeActiveTrips is how many trips a free account may have open at once — not
// how many it may ever create. A trip that is over stops counting.
const FreeActiveTrips = 1

// UnlimitedDrafts is what a plan reports when drafting is not metered. A
// sentinel rather than a big number, so nothing renders "ร่างได้ 9999 ครั้ง".
const UnlimitedDrafts = -1

// SplitPerPersonTHB is the pass divided by a group, rounded up.
//
// It is on the button because a trip belongs to a group and the person tapping
// pay is doing the division in their head anyway; rounding up rather than down
// means nobody collects the shares and ends up ฿3 short.
func SplitPerPersonTHB(party int) int {
	if party <= 1 {
		return TripPassPriceTHB
	}
	return (TripPassPriceTHB + party - 1) / party
}

// SubscriptionPlan is one row of the price list.
type SubscriptionPlan struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Tagline  string   `json:"tagline"`
	PriceTHB int      `json:"price_thb"`
	Interval string   `json:"interval"`
	Perks    []string `json:"perks"`
	// IncludedDraftsPerPeriod is UnlimitedDrafts when the plan does not meter.
	IncludedDraftsPerPeriod int `json:"included_drafts_per_period"`
	// RefundableOnBooking is the whole argument of the Trip Pass, so it is a
	// field and not a line of copy: the paywall, the pricing page and the
	// receipt each have to state the refund, and one sentence duplicated across
	// three files is a sentence that ends up saying three different things.
	RefundableOnBooking bool `json:"refundable_on_booking"`
	// False until a gateway exists. The catalogue ships anyway: the screen that
	// will sell these is the screen already rendering them.
	Available bool `json:"available"`
}

// Plans is the catalogue (M26).
//
// The order matters and is not alphabetical: Trip Pass sits in the middle
// because that is where the eye lands first, and ROVE Year is there mostly to
// give ฿299 something to be compared against — it is a reference point, not
// the row this product expects to sell.
func Plans() []SubscriptionPlan {
	return []SubscriptionPlan{
		{
			ID:       FreePlanID,
			Name:     "ROVE ฟรี",
			Tagline:  "วางแผนทริปกับเพื่อนได้ครบ ไม่ต้องใส่บัตร",
			Interval: IntervalTrip,
			Perks: []string{
				fmt.Sprintf("วางแผนพร้อมกันได้ %d ทริป", FreeActiveTrips),
				fmt.Sprintf("ให้ AI ร่างแพลนฟรี %d ครั้ง", DefaultIncludedDrafts),
				"ห้องทริป สมาชิกไม่จำกัด",
				"หารบิล งบ และรายจ่ายจริง",
			},
			IncludedDraftsPerPeriod: DefaultIncludedDrafts,
			Available:               true,
		},
		{
			ID:       TripPassPlanID,
			Name:     "Trip Pass",
			Tagline:  "ปลดล็อกทริปนี้ทั้งใบ — จองผ่าน ROVE แล้วได้คืนเต็มจำนวน",
			PriceTHB: TripPassPriceTHB,
			Interval: IntervalTrip,
			Perks: []string{
				"ให้ AI ร่างและปรับแพลนได้ไม่จำกัดในทริปนี้",
				"ใครในห้องซื้อก็ปลดล็อกให้ทั้งทริป",
				fmt.Sprintf("จองผ่าน ROVE แล้วคืนให้เต็ม ฿%d", TripPassPriceTHB),
				fmt.Sprintf("หารกัน 4 คน = ฿%d ต่อคน", SplitPerPersonTHB(4)),
			},
			IncludedDraftsPerPeriod: UnlimitedDrafts,
			RefundableOnBooking:     true,
			Available:               true,
		},
		{
			ID:       YearPlanID,
			Name:     "ROVE Year",
			Tagline:  "เที่ยวปีละหลายทริป ไม่ต้องซื้อ pass ทีละใบ",
			PriceTHB: RoveYearPriceTHB,
			Interval: IntervalYear,
			Perks: []string{
				"ทุกทริปในหนึ่งปีปลดล็อกอัตโนมัติ",
				fmt.Sprintf("คิดเป็น ฿%d ต่อเดือน", RoveYearPriceTHB/12),
				fmt.Sprintf("คุ้มตั้งแต่ทริปที่ %d ของปี", RoveYearPriceTHB/TripPassPriceTHB+1),
			},
			IncludedDraftsPerPeriod: UnlimitedDrafts,
		},
	}
}

// PlanByID returns a plan from the catalogue, falling back to the free row —
// an unknown plan id must degrade to "not being charged", never to a blank.
func PlanByID(id string) SubscriptionPlan {
	plans := Plans()
	for _, plan := range plans {
		if plan.ID == id {
			return plan
		}
	}
	return plans[0]
}

// DefaultIncludedDrafts mirrors models.DefaultIncludedDrafts for the copy above.
// It lives here as a plain constant so pkg/domain keeps its rule of importing
// nothing from the rest of the app (§6.2).
//
// Three, not two, since M26: a free trip costs about ฿2 of model time, which is
// a fraction of what the advertising that brought that person here cost. Being
// generous at this end is the cheapest acquisition spend in the product.
const DefaultIncludedDrafts = 3
