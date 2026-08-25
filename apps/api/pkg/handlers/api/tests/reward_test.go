package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// M22 — A12.10 / A12.11 / A12.12: points out, money owed, and handing a trip
// to a human.

type redemptionResponse struct {
	Balance int `json:"balance"`
	Tiers   []struct {
		AmountTHB int  `json:"amount_thb"`
		Points    int  `json:"points"`
		Afford    bool `json:"afford"`
	} `json:"tiers"`
	Codes []struct {
		Code      string  `json:"code"`
		AmountTHB float64 `json:"amount_thb"`
		Usable    bool    `json:"usable"`
	} `json:"codes"`
}

type discountResponse struct {
	Code        string  `json:"code"`
	AmountTHB   float64 `json:"amount_thb"`
	PointsSpent int     `json:"points_spent"`
	Usable      bool    `json:"usable"`
}

type creditsResponse struct {
	Order *struct {
		SubtotalTHB float64 `json:"subtotal_thb"`
		DiscountTHB float64 `json:"discount_thb"`
		TotalTHB    float64 `json:"total_thb"`
	} `json:"order"`
}

type earningsResponse struct {
	Totals struct {
		PendingTHB float64 `json:"pending_thb"`
		PayableTHB float64 `json:"payable_thb"`
		PaidTHB    float64 `json:"paid_thb"`
		Count      int     `json:"count"`
	} `json:"totals"`
	SharePercent int `json:"share_percent"`
	Entries      []struct {
		Partner       string  `json:"partner"`
		CommissionTHB float64 `json:"commission_thb"`
		AmountTHB     float64 `json:"amount_thb"`
		Estimated     bool    `json:"estimated"`
		Status        string  `json:"status"`
	} `json:"entries"`
}

func givePoints(h *testsupport.Harness, userID string, delta int) {
	h.T.Helper()
	if err := h.DB.Create(&models.UserPoints{
		UserID: userID, Delta: delta, Reason: models.PointsReasonAdjustment,
		OccurredAt: time.Now().UTC(),
	}).Error; err != nil {
		h.T.Fatalf("give points: %v", err)
	}
}

/* ------------------------------------------------- redemption (A12.10) --- */

func TestRedeemBurnsPointsAndIssuesOneCode(t *testing.T) {
	h := testsupport.New(t)
	user, token := h.User("saver")
	givePoints(h, user.ID, 1000)

	var code discountResponse
	h.Request(http.MethodPost, "/api/v1/users/me/points/redeem", token,
		map[string]any{"amount_thb": 100}).
		ExpectStatus(http.StatusCreated).Decode(&code)

	if code.AmountTHB != 100 || code.PointsSpent != 800 || !code.Usable {
		t.Fatalf("code = %+v, want ฿100 for 800 points, usable", code)
	}

	var list redemptionResponse
	h.Request(http.MethodGet, "/api/v1/users/me/points/redemptions", token, nil).
		ExpectStatus(http.StatusOK).Decode(&list)

	if list.Balance != 200 {
		t.Errorf("balance = %d, want 200 left", list.Balance)
	}
	if len(list.Codes) != 1 || list.Codes[0].Code != code.Code {
		t.Errorf("codes = %+v, want the one just issued", list.Codes)
	}
	for _, tier := range list.Tiers {
		if tier.AmountTHB == 100 && tier.Afford {
			t.Error("a ฿100 tier is affordable on 200 points")
		}
	}
}

func TestRedeemRefusesWhatItCannotIssue(t *testing.T) {
	h := testsupport.New(t)
	user, token := h.User("saver")
	givePoints(h, user.ID, 10_000)

	// Not a published tier.
	h.Request(http.MethodPost, "/api/v1/users/me/points/redeem", token,
		map[string]any{"amount_thb": 77}).ExpectStatus(http.StatusBadRequest)

	// Not enough points.
	_, pauperToken := h.User("pauper")
	h.Request(http.MethodPost, "/api/v1/users/me/points/redeem", pauperToken,
		map[string]any{"amount_thb": 50}).ExpectStatus(http.StatusBadRequest)
}

func TestDiscountCodeIsSingleUseAndOnlyMine(t *testing.T) {
	h := testsupport.New(t)
	user, token := h.User("saver")
	_, otherToken := h.User("other")
	givePoints(h, user.ID, 1000)

	trip := h.Trip(user, "โตเกียว")
	other := h.Trip(mustUser(h, "other"), "โอซาก้า")

	var code discountResponse
	h.Request(http.MethodPost, "/api/v1/users/me/points/redeem", token,
		map[string]any{"amount_thb": 100}).
		ExpectStatus(http.StatusCreated).Decode(&code)

	// Somebody else's code does not exist as far as they are concerned.
	h.Request(http.MethodPost, "/api/v1/trips/"+other.ID+"/ai/credits/purchase", otherToken,
		map[string]any{"quantity": 1, "method": "promptpay", "discount_code": code.Code}).
		ExpectStatus(http.StatusBadRequest)

	var first creditsResponse
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", token,
		map[string]any{"quantity": 1, "method": "promptpay", "discount_code": code.Code}).
		ExpectStatus(http.StatusOK).Decode(&first)

	if first.Order == nil || first.Order.DiscountTHB != 39 || first.Order.TotalTHB != 0 {
		t.Fatalf("order = %+v, want the ฿39 draft cleared by the code with no change", first.Order)
	}

	// The same code a second time is spent.
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", token,
		map[string]any{"quantity": 1, "method": "promptpay", "discount_code": code.Code}).
		ExpectStatus(http.StatusBadRequest)
}

/* --------------------------------------------- revenue share (A12.11) ---- */

func TestConfirmedBookingWritesTheCreatorTheirShare(t *testing.T) {
	h := testsupport.New(t)
	creator, creatorToken := h.User("creator")
	follower, followerToken := h.User("follower")

	source := h.Trip(creator, "โตเกียวต้นฉบับ")
	copyTrip := h.Trip(follower, "โตเกียวตามรอย")
	copyTrip.SourceCreatorID = &creator.ID
	copyTrip.SourceTripID = &source.ID
	if err := h.DB.Save(copyTrip).Error; err != nil {
		t.Fatalf("save: %v", err)
	}

	price := 12_000.0
	booking := &models.Booking{
		TripID: copyTrip.ID, Kind: models.BookingStay, Title: "โรงแรมชินจูกุ",
		Partner: "agoda", Status: models.BookingIdea, PricePerPersonTHB: &price,
	}
	if err := h.DB.Create(booking).Error; err != nil {
		t.Fatalf("booking: %v", err)
	}

	h.Request(http.MethodPatch, "/api/v1/trips/"+copyTrip.ID+"/bookings/"+booking.ID, followerToken,
		map[string]any{"status": models.BookingBooked}).ExpectStatus(http.StatusOK)

	var out earningsResponse
	h.Request(http.MethodGet, "/api/v1/users/me/earnings", creatorToken, nil).
		ExpectStatus(http.StatusOK).Decode(&out)

	if len(out.Entries) != 1 {
		t.Fatalf("entries = %+v, want one", out.Entries)
	}
	entry := out.Entries[0]
	// Four people at ฿12,000 is ฿48,000; Agoda pays 5%; the creator takes 30%.
	if entry.CommissionTHB != 2400 || entry.AmountTHB != 720 {
		t.Errorf("entry = %+v, want ฿2,400 commission and ฿720 share", entry)
	}
	if !entry.Estimated {
		t.Error("nobody reported this commission — it must be flagged as an estimate")
	}
	if out.Totals.PendingTHB != 720 || out.SharePercent != 30 {
		t.Errorf("totals = %+v share = %d", out.Totals, out.SharePercent)
	}
}

func TestEarningsAreOnlyEverMine(t *testing.T) {
	h := testsupport.New(t)
	creator, _ := h.User("creator")
	_, strangerToken := h.User("stranger")

	if err := h.DB.Create(&models.CreatorEarning{
		UserID: creator.ID, TripID: "t", Partner: "agoda",
		CommissionTHB: 1000, SharePercent: 30, AmountTHB: 300,
		Status: models.EarningPayable, OccurredAt: time.Now().UTC(),
	}).Error; err != nil {
		t.Fatalf("earning: %v", err)
	}

	var out earningsResponse
	h.Request(http.MethodGet, "/api/v1/users/me/earnings", strangerToken, nil).
		ExpectStatus(http.StatusOK).Decode(&out)

	if len(out.Entries) != 0 || out.Totals.Count != 0 {
		t.Fatalf("a stranger sees %+v", out)
	}
}

/* --------------------------------------------- agent handoff (A12.12) ---- */

type leadResponse struct {
	ID          string `json:"id"`
	ContactName string `json:"contact_name"`
	Status      string `json:"status"`
	Simulated   bool   `json:"simulated"`
}

func TestAgentLeadIsStoredEvenWithNowhereToSendIt(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")

	var lead leadResponse
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/leads", token, map[string]any{
		"contact_name":  "ตอง",
		"contact_phone": "0812345678",
		"note":          "อยากได้ที่พักใกล้สถานี",
	}).ExpectStatus(http.StatusCreated).Decode(&lead)

	// No agent channel is configured in tests, so the lead is saved and says so
	// rather than claiming somebody was messaged.
	if lead.Status != models.LeadNew || !lead.Simulated {
		t.Fatalf("lead = %+v, want a saved-but-unsent lead", lead)
	}

	var list []leadResponse
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/leads", token, nil).
		ExpectStatus(http.StatusOK).Decode(&list)
	if len(list) != 1 || list[0].ContactName != "ตอง" {
		t.Fatalf("list = %+v", list)
	}
}

func TestAgentLeadNeedsAWayToBeContacted(t *testing.T) {
	h := testsupport.New(t)
	owner, token := h.User("owner")
	trip := h.Trip(owner, "โตเกียว")

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/leads", token,
		map[string]any{"contact_name": "ตอง"}).ExpectStatus(http.StatusBadRequest)
}

func TestAgentLeadsAreClosedToOutsiders(t *testing.T) {
	h := testsupport.New(t)
	owner, _ := h.User("owner")
	_, outsiderToken := h.User("outsider")
	trip := h.Trip(owner, "โตเกียว")

	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/leads", outsiderToken, nil).ExpectDenied()
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/leads", outsiderToken,
		map[string]any{"contact_name": "x", "contact_phone": "1"}).ExpectDenied()
}

/* ------------------------------------------------------------ helpers ---- */

// mustUser finds an already-created account by display name.
func mustUser(h *testsupport.Harness, name string) *models.User {
	h.T.Helper()
	var user models.User
	if err := h.DB.Where("display_name = ?", name).First(&user).Error; err != nil {
		h.T.Fatalf("find user %s: %v", name, err)
	}
	return &user
}
