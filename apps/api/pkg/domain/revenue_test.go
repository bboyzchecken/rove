package domain

import (
	"strings"
	"testing"
)

func TestPointsForDiscountMatchesTheRewardPromised(t *testing.T) {
	// The rate was rebased in M26 onto the thing points actually buy: a Trip
	// Pass. The promise made to users is sixteen referrals for one free trip
	// (docs/customer-acquisition.md), so a pass must not cost more points than
	// sixteen referrals earn — otherwise the reward is advertised and withheld.
	sixteen := 16 * PointsPerReferral
	if got := PointsForDiscount(TripPassPriceTHB); got > sixteen {
		t.Fatalf("a Trip Pass costs %d points, more than the %d that sixteen referrals earn",
			got, sixteen)
	}
	if got := PointsForDiscount(100); got != 800 {
		t.Errorf("PointsForDiscount(100) = %d, want 800", got)
	}
}

func TestOnlyPublishedTiersCanBeRedeemed(t *testing.T) {
	for _, tier := range RedemptionTiers {
		if !IsRedemptionTier(tier) {
			t.Errorf("tier %d is not accepted by its own check", tier)
		}
	}
	for _, amount := range []int{0, 49, 51, 1000, -100} {
		if IsRedemptionTier(amount) {
			t.Errorf("%d passed as a tier", amount)
		}
	}
}

func TestNewDiscountCodeIsTypableAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		code := NewDiscountCode()
		if !strings.HasPrefix(code, "ROVE-") || len(code) != 11 {
			t.Fatalf("code = %q, want ROVE- plus six characters", code)
		}
		// The four characters that get typed as each other.
		if strings.ContainsAny(code[5:], "IO01") {
			t.Fatalf("code = %q contains a character nobody can transcribe", code)
		}
		if seen[code] {
			t.Fatalf("collision on %q within 200 codes", code)
		}
		seen[code] = true
	}
}

func TestApplyDiscountNeverGivesChange(t *testing.T) {
	total, applied := ApplyDiscount(39, 100)
	if total != 0 || applied != 39 {
		t.Fatalf("total %v applied %v, want the bill cleared and nothing refunded", total, applied)
	}

	total, applied = ApplyDiscount(390, 100)
	if total != 290 || applied != 100 {
		t.Fatalf("total %v applied %v, want 290 / 100", total, applied)
	}

	total, applied = ApplyDiscount(390, 0)
	if total != 390 || applied != 0 {
		t.Fatalf("total %v applied %v, want the bill untouched", total, applied)
	}
}

func TestCommissionPrefersWhatThePartnerReported(t *testing.T) {
	amount, estimated := CommissionTHB("agoda", 10000, 380, true)
	if amount != 380 || estimated {
		t.Fatalf("got %v estimated=%v, want the reported 380", amount, estimated)
	}

	// Reported zero is a fact, not a missing value.
	amount, estimated = CommissionTHB("agoda", 10000, 0, true)
	if amount != 0 || estimated {
		t.Fatalf("got %v estimated=%v, want an honest zero", amount, estimated)
	}

	amount, estimated = CommissionTHB("agoda", 10000, 0, false)
	if amount != 500 || !estimated {
		t.Fatalf("got %v estimated=%v, want 5%% of 10000, flagged", amount, estimated)
	}
}

func TestCommissionFallsBackConservatively(t *testing.T) {
	amount, estimated := CommissionTHB("some-new-partner", 10000, 0, false)
	if amount != 300 || !estimated {
		t.Fatalf("got %v estimated=%v, want the 3%% default, flagged", amount, estimated)
	}
	if DefaultCommissionRate >= partnerCommissionRate["agoda"] {
		t.Error("the fallback rate should be no higher than a known partner's")
	}
}

func TestCreatorShareIsThirtyPercentOfTheCommission(t *testing.T) {
	if got := CreatorShareTHB(500); got != 150 {
		t.Fatalf("share of 500 = %v, want 150", got)
	}
	if got := CreatorShareTHB(0); got != 0 {
		t.Fatalf("share of nothing = %v, want 0", got)
	}
}
