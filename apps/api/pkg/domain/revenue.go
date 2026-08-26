package domain

import (
	"crypto/rand"
	"math"
	"strings"
	"time"
)

// Turning points into money off, and turning a partner's commission into what
// a creator is owed (DEV_SPEC A12.10 / A12.11).

/* ------------------------------------------------- redemption (A12.10) --- */

// RedemptionOpen is the switch on minting new discount codes (Phase 6).
//
// Closed 26 ส.ค. 2569. The rate below was derived from exactly one internal
// price and never from what a point costs to award, so every code minted at it
// is a liability nobody has measured. Codes are also about to stop being
// ROVE-only — a partner voucher priced at a guessed rate cannot be repriced
// after it is in someone's hand. See docs/phase-6-points-economy.md.
//
// Closing the mint is not defaulting on what was already issued: codes that
// exist stay valid and stay redeemable, which is why resolveDiscount is
// untouched below.
const RedemptionOpen = false

// PointsPerBahtRedeemed is the exchange rate out of the points economy.
//
// It is set from the one price the product already has: an extra AI draft is
// 300 points or ฿39, which is 7.7 points per baht. Eight is that number,
// rounded the way that does not quietly make points worth more when redeemed
// than when spent directly.
const PointsPerBahtRedeemed = 8

// RedemptionTiers are the amounts a code can be issued for. A free-text field
// would let someone burn 9,999 points on a ฿1,249.875 code that no receipt can
// print cleanly.
var RedemptionTiers = []int{50, 100, 300}

// DiscountValidity is how long a code lives. Long enough to plan a trip
// around, short enough that the liability does not sit on the books forever.
const DiscountValidity = 180 * 24 * time.Hour

func PointsForDiscount(amountTHB int) int { return amountTHB * PointsPerBahtRedeemed }

// IsRedemptionTier reports whether an amount is one this product issues.
func IsRedemptionTier(amountTHB int) bool {
	for _, tier := range RedemptionTiers {
		if tier == amountTHB {
			return true
		}
	}
	return false
}

// discountAlphabet leaves out I, O, 0 and 1: a code is read off a screen and
// typed on a phone, and those four are the ones that get typed as each other.
const discountAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// NewDiscountCode returns a code in ROVE-XXXXXX form.
func NewDiscountCode() string {
	buf := make([]byte, 6)
	// crypto/rand only fails if the OS entropy source does, which is not a
	// condition this can recover from meaningfully.
	if _, err := rand.Read(buf); err != nil {
		return "ROVE-" + strings.Repeat(discountAlphabet[:1], 6)
	}

	var b strings.Builder
	b.WriteString("ROVE-")
	for _, v := range buf {
		b.WriteByte(discountAlphabet[int(v)%len(discountAlphabet)])
	}
	return b.String()
}

// ApplyDiscount returns what is actually charged and what the discount was
// worth. A code bigger than the bill is not change: the excess is simply not
// used, which is why the receipt shows both numbers.
func ApplyDiscount(subtotalTHB, discountTHB float64) (total, applied float64) {
	if discountTHB <= 0 || subtotalTHB <= 0 {
		return subtotalTHB, 0
	}
	applied = math.Min(discountTHB, subtotalTHB)
	return round2(subtotalTHB - applied), round2(applied)
}

/* ------------------------------------------- creator revenue share (A12.11) */

// CreatorSharePercent is the cut of the commission that goes to the person
// whose published plan produced the booking (§6.5).
const CreatorSharePercent = 30

// partnerCommissionRate is what each partner pays us, as a fraction of the
// booking value. Used ONLY when a postback does not carry the commission —
// every earning derived this way is flagged `estimated`, and the payout report
// shows the flag, because paying out on an estimate is a decision somebody has
// to make on purpose.
var partnerCommissionRate = map[string]float64{
	"agoda":      0.05,
	"booking":    0.04,
	"klook":      0.05,
	"kkday":      0.05,
	"rentalcars": 0.06,
	"airalo":     0.10,
}

// DefaultCommissionRate is the conservative fallback for a partner not listed
// above: better to under-accrue and correct upwards than to promise a creator
// money that never arrives.
const DefaultCommissionRate = 0.03

// CommissionTHB works out what we earned on a booking.
//
// `reported` wins whenever the partner sent it, including when it is zero:
// a partner saying "this converted but paid nothing" is information, not a
// missing value. That is what `hasReported` distinguishes.
func CommissionTHB(partner string, bookingValueTHB, reported float64, hasReported bool) (amount float64, estimated bool) {
	if hasReported {
		return round2(reported), false
	}
	if bookingValueTHB <= 0 {
		return 0, true
	}

	rate, ok := partnerCommissionRate[strings.ToLower(partner)]
	if !ok {
		rate = DefaultCommissionRate
	}
	return round2(bookingValueTHB * rate), true
}

// CreatorShareTHB is the creator's cut of a commission, to the satang.
func CreatorShareTHB(commissionTHB float64) float64 {
	if commissionTHB <= 0 {
		return 0
	}
	return round2(commissionTHB * float64(CreatorSharePercent) / 100)
}

// MinimumPayoutTHB is the floor a balance has to reach before a transfer is
// worth making. Below it the earnings stay payable and roll into next month.
const MinimumPayoutTHB = 300
