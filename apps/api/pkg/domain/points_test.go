package domain

import "testing"

func TestCalculatePoints(t *testing.T) {
	cfg := PointsConfig{EarnRatePct: 30}

	cases := []struct {
		name       string
		commission float64
		creator    string
		booker     string
		wantUser   string
		wantAmount int
	}{
		{"floors the fraction", 100, "creator", "booker", "creator", 30},
		{"floors down not up", 99.9, "creator", "booker", "creator", 29},
		{"no source creator earns nothing", 100, "", "booker", "", 0},
		{"self booking earns nothing", 100, "same", "same", "", 0},
		{"zero commission earns nothing", 0, "creator", "booker", "", 0},
		{"negative commission earns nothing", -50, "creator", "booker", "", 0},
		{"tiny commission rounds to zero", 1, "creator", "booker", "", 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CalculatePoints(tc.commission, cfg, tc.creator, tc.booker)
			if got.UserID != tc.wantUser || got.Amount != tc.wantAmount {
				t.Errorf("got %+v, want user %q amount %d", got, tc.wantUser, tc.wantAmount)
			}
		})
	}
}

func TestCalculatePointsZeroRateDisablesEarning(t *testing.T) {
	got := CalculatePoints(1000, PointsConfig{EarnRatePct: 0}, "creator", "booker")

	if got.Amount != 0 {
		t.Errorf("Amount = %d with a zero rate, want 0", got.Amount)
	}
}

func TestCanRedeem(t *testing.T) {
	cfg := PointsConfig{MinRedeemBalance: 100}

	cases := []struct {
		balance float64
		want    bool
	}{
		{0, false},
		{99, false},
		{100, true},
		{500, true},
	}
	for _, tc := range cases {
		if got := CanRedeem(tc.balance, cfg); got != tc.want {
			t.Errorf("CanRedeem(%v) = %v, want %v", tc.balance, got, tc.want)
		}
	}
}
