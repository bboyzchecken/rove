package domain

import "testing"

var defaults = Economy{CreatorSharePercent: 15, BookerCreditPercent: 8}

// The worked example in business-plan.md §3.1: a ฿1,500 hostel at 5%.
func TestSplitNeverGoesNegativeOnASmallBooking(t *testing.T) {
	got := SplitCommission(SplitInput{
		CommissionTHB: 75, HasSourceCreator: true, PassTotalTHB: 299, PassRefundable: true,
	}, defaults)

	if got.CreatorShareTHB != 11.25 || got.GatewayFeeTHB != 11.96 || got.AICostTHB != 6 {
		t.Fatalf("cost of sale = %+v", got)
	}
	if got.TripPassRefundTHB != got.AfterCostTHB {
		t.Errorf("refund %v should be capped at what is left %v", got.TripPassRefundTHB, got.AfterCostTHB)
	}
	if got.AfterRefundTHB != 0 || got.BookerCreditTHB != 0 {
		t.Errorf("nothing is left for the booker, got %+v", got)
	}
}

func TestSplitOnABigBookingPaysTheFullRefundAndACredit(t *testing.T) {
	got := SplitCommission(SplitInput{
		CommissionTHB: 1450, HasSourceCreator: true, PassTotalTHB: 299, PassRefundable: true,
	}, defaults)

	if got.TripPassRefundTHB != 299 {
		t.Fatalf("refund = %v, want the whole pass", got.TripPassRefundTHB)
	}
	wantAfter := round2(1450 - 6 - 11.96 - 217.5 - 299)
	if got.AfterRefundTHB != wantAfter {
		t.Fatalf("after refund = %v, want %v", got.AfterRefundTHB, wantAfter)
	}
	if got.BookerCreditTHB != round2(wantAfter*0.08) {
		t.Errorf("booker credit = %v", got.BookerCreditTHB)
	}
}

func TestSplitWithoutACreatorOrPassPaysOnlyTheBooker(t *testing.T) {
	got := SplitCommission(SplitInput{CommissionTHB: 600}, defaults)
	if got.CreatorShareTHB != 0 || got.TripPassRefundTHB != 0 || got.GatewayFeeTHB != 0 {
		t.Fatalf("got %+v", got)
	}
	if got.BookerCreditTHB != round2((600-2)*0.08) {
		t.Errorf("booker credit = %v", got.BookerCreditTHB)
	}
}

func TestSplitRefundsAPassOnlyOnce(t *testing.T) {
	got := SplitCommission(SplitInput{CommissionTHB: 1450, PassTotalTHB: 299, PassRefundable: false}, defaults)
	if got.TripPassRefundTHB != 0 {
		t.Fatalf("refunded an already-refunded pass: %v", got.TripPassRefundTHB)
	}
}

func TestEconomySettingsFallBackWhenMissingOrOutOfRange(t *testing.T) {
	eco := EconomyFromSettings(map[string]string{
		SettingCreatorSharePercent: "90",
		SettingBookerCreditPercent: "5",
	})
	if eco.CreatorSharePercent != DefaultCreatorSharePercent || eco.BookerCreditPercent != 5 {
		t.Fatalf("got %+v", eco)
	}
}
