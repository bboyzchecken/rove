package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
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

// issueCode writes a discount code the way the mint used to, without going
// through the closed endpoint. Everything downstream of issuing — spending,
// single use, ownership — still has to work for the codes already out there.
func issueCode(h *testsupport.Harness, userID string, amountTHB float64) *models.DiscountCode {
	h.T.Helper()
	code := &models.DiscountCode{
		UserID:      userID,
		Code:        domain.NewDiscountCode(),
		Scope:       models.DiscountScopeAICredits,
		AmountTHB:   amountTHB,
		PointsSpent: int(amountTHB) * domain.PointsPerBahtRedeemed,
		ExpiresAt:   time.Now().UTC().Add(domain.DiscountValidity),
	}
	if err := h.DB.Create(code).Error; err != nil {
		h.T.Fatalf("issue code: %v", err)
	}
	return code
}

// The mint is closed pending Phase 6 (domain.RedemptionOpen). A closed mint is
// only actually closed if the endpoint says no — the button going away stops
// nobody with an old tab or a curl.
func TestRedeemIsClosedWhileTheRateIsBeingRepriced(t *testing.T) {
	h := testsupport.New(t)
	user, token := h.User("saver")
	givePoints(h, user.ID, 10_000)

	h.Request(http.MethodPost, "/api/v1/users/me/points/redeem", token,
		map[string]any{"amount_thb": 100}).ExpectStatus(http.StatusForbidden)

	var list redemptionResponse
	h.Request(http.MethodGet, "/api/v1/users/me/points/redemptions", token, nil).
		ExpectStatus(http.StatusOK).Decode(&list)

	// Refused, not silently swallowed: the points are all still there.
	if list.Balance != 10_000 {
		t.Errorf("balance = %d, want 10,000 — a refused redemption must not burn", list.Balance)
	}
	// And nothing advertises a price that cannot be paid.
	if len(list.Tiers) != 0 {
		t.Errorf("tiers = %+v, want none while the mint is closed", list.Tiers)
	}
}

// Closing the mint is not defaulting on codes already issued.
func TestCodesIssuedBeforeTheCloseStillSpend(t *testing.T) {
	h := testsupport.New(t)
	user, token := h.User("saver")
	trip := h.Trip(user, "โตเกียว")
	code := issueCode(h, user.ID, 100)

	var list redemptionResponse
	h.Request(http.MethodGet, "/api/v1/users/me/points/redemptions", token, nil).
		ExpectStatus(http.StatusOK).Decode(&list)
	if len(list.Codes) != 1 || !list.Codes[0].Usable {
		t.Fatalf("codes = %+v, want the existing one still usable", list.Codes)
	}

	var order creditsResponse
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", token,
		map[string]any{"quantity": 1, "method": "promptpay", "discount_code": code.Code}).
		ExpectStatus(http.StatusOK).Decode(&order)

	if order.Order == nil || order.Order.TotalTHB != 0 {
		t.Fatalf("order = %+v, want the ฿39 draft cleared by the existing code", order.Order)
	}
}

func TestDiscountCodeIsSingleUseAndOnlyMine(t *testing.T) {
	h := testsupport.New(t)
	user, token := h.User("saver")
	_, otherToken := h.User("other")

	trip := h.Trip(user, "โตเกียว")
	other := h.Trip(mustUser(h, "other"), "โอซาก้า")

	code := issueCode(h, user.ID, 100)

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
