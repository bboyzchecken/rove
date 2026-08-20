package domain

import "math"

// Points are the incentive that makes someone open their trip to the public:
// when a stranger clones your trip and books through it, you earn points
// (DEV_SPEC §1, §6.5).
//
// The rule is deliberately boring — a fixed percentage of the commission we
// actually receive, floored — because it has to be explainable in one line on
// the points history screen.

// PointsConfig is read from Config.Points.
type PointsConfig struct {
	// EarnRatePct is the share of commission converted to points, 0..100.
	EarnRatePct float64
	// MinRedeemBalance is the floor below which points cannot be spent (Phase 2).
	MinRedeemBalance float64
}

// DefaultPointsConfig is what ships until the numbers are tuned against real
// commission data.
var DefaultPointsConfig = PointsConfig{EarnRatePct: 30, MinRedeemBalance: 100}

// PointsAward is the decision: who earns, how much, and why.
type PointsAward struct {
	UserID string
	Amount int
	Reason string
}

// CalculatePoints floors commission × rate. It returns 0 — not an error — for
// every case where nobody earns anything, so the caller has one branch.
//
// A creator never earns from their own booking: that would turn the public
// incentive into a self-referral loop.
func CalculatePoints(commission float64, cfg PointsConfig, sourceCreatorID, bookerID string) PointsAward {
	switch {
	case sourceCreatorID == "":
		return PointsAward{} // the trip was not cloned from anyone
	case sourceCreatorID == bookerID:
		return PointsAward{Reason: "self_booking"}
	case commission <= 0 || cfg.EarnRatePct <= 0:
		return PointsAward{}
	}

	amount := int(math.Floor(commission * cfg.EarnRatePct / 100))
	if amount <= 0 {
		return PointsAward{}
	}
	return PointsAward{
		UserID: sourceCreatorID,
		Amount: amount,
		Reason: "earn_from_clone",
	}
}

// CanRedeem reports whether a balance is above the redemption floor.
func CanRedeem(balance float64, cfg PointsConfig) bool {
	return balance >= cfg.MinRedeemBalance && balance > 0
}
