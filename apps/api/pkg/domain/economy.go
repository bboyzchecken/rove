package domain

import (
	"math"
	"strconv"
)

// What one partner commission pays out, and to whom (Feedback #4 D-30 —
// docs/business-plan.md §3.1).
//
// The payouts cascade from what is left rather than being subtracted side by
// side, so no booking — however small — can cost the company more than it
// earned: cost of sale first, then the Trip Pass credit out of what remains,
// then the booker's credit as a share of what remains after that.

const (
	SettingCreatorSharePercent = "creator_share_percent"
	SettingBookerCreditPercent = "booker_credit_percent"

	DefaultCreatorSharePercent = 15
	DefaultBookerCreditPercent = 8
	MaxCreatorSharePercent     = 50
	MaxBookerCreditPercent     = 20

	// AI drafting cost per trip, from the per-draft constants in the AI
	// pipeline: a pass trip drafts more.
	AICostFreeTripTHB = 2
	AICostPassTripTHB = 6
	// GatewayFeeRate is charged on the Trip Pass purchase. A placeholder until
	// a gateway is signed (A20.8).
	GatewayFeeRate = 0.04

	// MinimumBookerCreditTHB — a credit worth less than a baht is noise.
	MinimumBookerCreditTHB = 1
)

// Economy is the admin-tunable part of the split.
type Economy struct {
	CreatorSharePercent int `json:"creator_share_percent"`
	BookerCreditPercent int `json:"booker_credit_percent"`
}

// EconomyFromSettings reads the two percents, falling back to the defaults for
// anything missing or out of range.
func EconomyFromSettings(values map[string]string) Economy {
	return Economy{
		CreatorSharePercent: percentSetting(values[SettingCreatorSharePercent], DefaultCreatorSharePercent, MaxCreatorSharePercent),
		BookerCreditPercent: percentSetting(values[SettingBookerCreditPercent], DefaultBookerCreditPercent, MaxBookerCreditPercent),
	}
}

func percentSetting(raw string, fallback, max int) int {
	v, err := strconv.Atoi(raw)
	if err != nil || v < 0 || v > max {
		return fallback
	}
	return v
}

// SplitInput is one confirmed booking.
type SplitInput struct {
	CommissionTHB float64
	// The trip was copied from someone's public plan.
	HasSourceCreator bool
	// Total actually charged for the trip's pass, 0 on the free tier.
	PassTotalTHB float64
	// The pass has not been refunded by an earlier booking.
	PassRefundable bool
}

type Split struct {
	CommissionTHB     float64 `json:"commission_thb"`
	AICostTHB         float64 `json:"ai_cost_thb"`
	GatewayFeeTHB     float64 `json:"gateway_fee_thb"`
	CreatorShareTHB   float64 `json:"creator_share_thb"`
	CreatorPercent    int     `json:"creator_percent"`
	AfterCostTHB      float64 `json:"after_cost_thb"`
	TripPassRefundTHB float64 `json:"trip_pass_refund_thb"`
	AfterRefundTHB    float64 `json:"after_refund_thb"`
	BookerCreditTHB   float64 `json:"booker_credit_thb"`
	BookerPercent     int     `json:"booker_percent"`
}

func SplitCommission(in SplitInput, eco Economy) Split {
	commission := math.Max(0, in.CommissionTHB)
	hasPass := in.PassTotalTHB > 0

	out := Split{CommissionTHB: round2(commission), BookerPercent: eco.BookerCreditPercent}
	if hasPass {
		out.AICostTHB = AICostPassTripTHB
		out.GatewayFeeTHB = round2(in.PassTotalTHB * GatewayFeeRate)
	} else {
		out.AICostTHB = AICostFreeTripTHB
	}
	if in.HasSourceCreator {
		out.CreatorPercent = eco.CreatorSharePercent
		out.CreatorShareTHB = round2(commission * float64(eco.CreatorSharePercent) / 100)
	}

	out.AfterCostTHB = round2(math.Max(0, commission-out.AICostTHB-out.GatewayFeeTHB-out.CreatorShareTHB))
	if hasPass && in.PassRefundable {
		out.TripPassRefundTHB = round2(math.Min(in.PassTotalTHB, out.AfterCostTHB))
	}
	out.AfterRefundTHB = round2(math.Max(0, out.AfterCostTHB-out.TripPassRefundTHB))

	credit := round2(out.AfterRefundTHB * float64(eco.BookerCreditPercent) / 100)
	if credit >= MinimumBookerCreditTHB {
		out.BookerCreditTHB = credit
	}
	return out
}
