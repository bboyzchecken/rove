package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// A20 — bill & payment, as reshaped by M26.
//
// What is sold is a Trip Pass: one trip, everyone in its room, ฿299 back when
// that trip produces a booking. The properties worth a test here are all about
// damage. A receipt names what somebody bought, so it must not be readable by
// anyone else. A room where two friends tap pay at the same second must not be
// charged twice. And the refund is a promise about money, so it has to happen
// exactly once however many bookings a trip ends up producing.

type receiptBody struct {
	ID          string  `json:"id"`
	Number      string  `json:"number"`
	Kind        string  `json:"kind"`
	Status      string  `json:"status"`
	Method      string  `json:"method"`
	TotalTHB    float64 `json:"total_thb"`
	SubtotalTHB float64 `json:"subtotal_thb"`
	DiscountTHB float64 `json:"discount_thb"`
	PointsSpent int     `json:"points_spent"`
	Simulated   bool    `json:"simulated"`
	TripID      *string `json:"trip_id"`
	RefundedAt  *string `json:"refunded_at"`
	Lines       []struct {
		Quantity int `json:"quantity"`
	} `json:"lines"`
}

type passBody struct {
	HasPass          bool         `json:"has_pass"`
	Included         int          `json:"included"`
	Used             int          `json:"used"`
	PassPriceTHB     int          `json:"pass_price_thb"`
	PassRefundable   bool         `json:"pass_refundable"`
	PassPerPersonTHB int          `json:"pass_per_person_thb"`
	Order            *receiptBody `json:"order"`
}

type summaryBody struct {
	Orders        int     `json:"orders"`
	TotalSpentTHB float64 `json:"total_spent_thb"`
	PointsSpent   int     `json:"points_spent"`
	Subscription  struct {
		PlanID string `json:"plan_id"`
		Status string `json:"status"`
	} `json:"subscription"`
}

// grantPoints tops up a balance the same way the ledger does, so anything under
// test takes the real path rather than a seeded shortcut.
func grantPoints(t *testing.T, h *testsupport.Harness, userID string, amount int) {
	t.Helper()
	entry := &models.UserPoints{
		UserID:     userID,
		Delta:      amount,
		Reason:     models.PointsReasonAdjustment,
		Note:       "test",
		OccurredAt: time.Now().UTC(),
	}
	if err := h.DB.Create(entry).Error; err != nil {
		t.Fatalf("grant points: %v", err)
	}
}

// buyPass is the purchase most of these tests start from.
func buyPass(t *testing.T, h *testsupport.Harness, tripID, token string) passBody {
	t.Helper()
	var out passBody
	h.Request(http.MethodPost, "/api/v1/trips/"+tripID+"/pass", token,
		map[string]any{"method": domain.PayMethodPromptPay, "channel": "พร้อมเพย์ (QR)"}).
		ExpectStatus(http.StatusOK).
		Decode(&out)
	return out
}

func TestBuyingATripPassLeavesAReceipt(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	purchase := buyPass(t, h, trip.ID, token)

	if !purchase.HasPass {
		t.Fatal("paying for a pass did not unlock the trip")
	}
	if purchase.Order == nil {
		t.Fatal("purchase returned no receipt")
	}

	order := purchase.Order
	if order.Number == "" {
		t.Error("receipt has no number")
	}
	if order.Status != domain.OrderPaid || order.Kind != domain.OrderKindTripPass {
		t.Errorf("receipt = %s/%s, want paid/trip_pass", order.Status, order.Kind)
	}
	if order.TotalTHB != float64(domain.TripPassPriceTHB) {
		t.Errorf("total = %.2f, want %d", order.TotalTHB, domain.TripPassPriceTHB)
	}
	// No gateway in Phase 1: a cash order must say so on its face (§16).
	if !order.Simulated {
		t.Error("cash order is not flagged simulated while there is no gateway")
	}
	if order.TripID == nil || *order.TripID != trip.ID {
		t.Error("receipt does not name the trip it was bought for")
	}
	// The price the group actually argues about is the per-person one (W26.3).
	if purchase.PassPerPersonTHB != domain.SplitPerPersonTHB(trip.PartySize) {
		t.Errorf("per person = %d, want %d",
			purchase.PassPerPersonTHB, domain.SplitPerPersonTHB(trip.PartySize))
	}
	if !purchase.PassRefundable {
		t.Error("the pass does not advertise the refund it is sold on")
	}

	// And it is readable afterwards, which is the whole point of filing it.
	var fetched receiptBody
	h.Request(http.MethodGet, "/api/v1/users/me/billing/orders/"+order.ID, token, nil).
		ExpectStatus(http.StatusOK).
		Decode(&fetched)
	if fetched.Number != order.Number {
		t.Errorf("fetched receipt %q, want %q", fetched.Number, order.Number)
	}
}

// A pass belongs to the trip, not to the person who paid (A26.2). A group where
// everybody has to buy their own is a group that buys none.
func TestPassUnlocksTheWholeRoom(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	bob, bobToken := h.User("bob")
	trip := h.Trip(alice, "ทริปกับเพื่อน")
	h.AddMember(trip, bob, models.TripRoleEditor)

	buyPass(t, h, trip.ID, aliceToken)

	var seenByBob passBody
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/ai/credits", bobToken, nil).
		ExpectStatus(http.StatusOK).
		Decode(&seenByBob)

	if !seenByBob.HasPass {
		t.Error("bob is in the room alice paid for and still sees a paywall")
	}
}

// Two friends tapping pay in the same second is the normal case in a group
// trip, not a rare one.
func TestBuyingAPassTwiceDoesNotChargeTwice(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	first := buyPass(t, h, trip.ID, token)
	second := buyPass(t, h, trip.ID, token)

	if !second.HasPass {
		t.Error("the second attempt reports the trip as locked")
	}
	if second.Order != nil && first.Order != nil && second.Order.ID != first.Order.ID {
		t.Error("a second receipt was issued for a trip that was already paid for")
	}

	var summary summaryBody
	h.Request(http.MethodGet, "/api/v1/users/me/billing/summary", token, nil).
		ExpectStatus(http.StatusOK).
		Decode(&summary)
	if summary.Orders != 1 {
		t.Errorf("orders = %d, want 1", summary.Orders)
	}
	if summary.TotalSpentTHB != float64(domain.TripPassPriceTHB) {
		t.Errorf("total = %.2f, want %d", summary.TotalSpentTHB, domain.TripPassPriceTHB)
	}
	// Nobody is subscribed, and the free plan is an answer rather than a row.
	if summary.Subscription.PlanID != domain.FreePlanID || summary.Subscription.Status != "none" {
		t.Errorf("subscription = %s/%s, want free/none",
			summary.Subscription.PlanID, summary.Subscription.Status)
	}
}

// A receipt names what someone bought. It is nobody else's to read, and the
// refusal must not confirm that the id exists.
func TestReceiptIsNotReadableByAnotherUser(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	_, bobToken := h.User("bob")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	purchase := buyPass(t, h, trip.ID, aliceToken)

	h.Request(http.MethodGet, "/api/v1/users/me/billing/orders/"+purchase.Order.ID, bobToken, nil).
		ExpectStatus(http.StatusNotFound)

	// Bob's own history stays empty — a shared table is not a shared list.
	var orders []receiptBody
	h.Request(http.MethodGet, "/api/v1/users/me/billing/orders", bobToken, nil).
		ExpectStatus(http.StatusOK).
		Decode(&orders)
	if len(orders) != 0 {
		t.Errorf("bob sees %d of alice's orders", len(orders))
	}
}

// Points stopped buying drafts in M26 and must not quietly start buying passes
// either: the exchange rate belongs in one place, the discount code (A26.5).
func TestPointsCannotPayForAPassDirectly(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	grantPoints(t, h, alice.ID, 10_000)

	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/pass", token,
		map[string]any{"method": domain.PayMethodPoints, "channel": "แต้ม ROVE"}).
		ExpectStatus(http.StatusBadRequest)
}

// A code minted against the old per-draft product still works. Withdrawing that
// product was our decision, not the code holder's.
func TestOldAICreditCodeStillWorksOnAPass(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	code := &models.DiscountCode{
		UserID:      alice.ID,
		Code:        "ROVE-LEGACY",
		Scope:       models.DiscountScopeAICredits,
		AmountTHB:   100,
		PointsSpent: 800,
		ExpiresAt:   time.Now().UTC().Add(24 * time.Hour),
	}
	if err := h.DB.Create(code).Error; err != nil {
		t.Fatalf("seed code: %v", err)
	}

	var purchase passBody
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/pass", token,
		map[string]any{
			"method":        domain.PayMethodCard,
			"channel":       "บัตรเครดิต",
			"discount_code": "rove-legacy",
		}).
		ExpectStatus(http.StatusOK).
		Decode(&purchase)

	if purchase.Order == nil {
		t.Fatal("purchase returned no receipt")
	}
	if purchase.Order.DiscountTHB != 100 {
		t.Errorf("discount = %.2f, want 100", purchase.Order.DiscountTHB)
	}
	if purchase.Order.TotalTHB != float64(domain.TripPassPriceTHB)-100 {
		t.Errorf("total = %.2f, want %d", purchase.Order.TotalTHB, domain.TripPassPriceTHB-100)
	}
}

/* ------------------------------------------------------ X26.1 — the refund */

// The refund is a promise about money: once per trip, however many bookings the
// trip produces. Ten confirmations must not mint ten credits.
func TestPassIsRefundedOnceHoweverManyBookings(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	purchase := buyPass(t, h, trip.ID, token)

	for i := 0; i < 3; i++ {
		var booking struct {
			ID string `json:"id"`
		}
		h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/bookings", token,
			map[string]any{"title": "โรงแรม", "partner": "agoda", "kind": models.BookingStay}).
			ExpectStatus(http.StatusCreated).
			Decode(&booking)

		h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/bookings/"+booking.ID, token,
			map[string]any{"status": models.BookingBooked}).
			ExpectStatus(http.StatusOK)
	}

	// The pass is marked refunded, exactly once.
	var order models.Order
	if err := h.DB.Where("id = ?", purchase.Order.ID).First(&order).Error; err != nil {
		t.Fatalf("reload order: %v", err)
	}
	if order.Status != domain.OrderRefunded {
		t.Errorf("order status = %s, want refunded", order.Status)
	}
	if order.RefundedAt == nil {
		t.Error("refunded order has no refund date")
	}

	// And exactly one credit was issued for it, worth what was actually paid.
	var codes []models.DiscountCode
	if err := h.DB.Where("user_id = ?", alice.ID).Find(&codes).Error; err != nil {
		t.Fatalf("load codes: %v", err)
	}
	if len(codes) != 1 {
		t.Fatalf("issued %d refund credits for one trip, want 1", len(codes))
	}
	if codes[0].AmountTHB != float64(domain.TripPassPriceTHB) {
		t.Errorf("credit = %.2f, want %d", codes[0].AmountTHB, domain.TripPassPriceTHB)
	}
	if codes[0].PointsSpent != 0 {
		t.Errorf("refund credit records %d points spent — it is money back, not loyalty",
			codes[0].PointsSpent)
	}
}

// A refunded pass still unlocks the trip. The money went back *because* a
// booking happened, and locking the room at that moment would punish exactly
// the thing the refund is rewarding.
func TestRefundedPassStillUnlocksTheTrip(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	buyPass(t, h, trip.ID, token)

	var booking struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/bookings", token,
		map[string]any{"title": "โรงแรม", "partner": "agoda", "kind": models.BookingStay}).
		ExpectStatus(http.StatusCreated).
		Decode(&booking)
	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/bookings/"+booking.ID, token,
		map[string]any{"status": models.BookingBooked}).
		ExpectStatus(http.StatusOK)

	var credits passBody
	h.Request(http.MethodGet, "/api/v1/trips/"+trip.ID+"/ai/credits", token, nil).
		ExpectStatus(http.StatusOK).
		Decode(&credits)
	if !credits.HasPass {
		t.Error("the trip locked itself the moment it earned its refund")
	}
}

// A trip nobody bought a pass for has nothing to refund, and a booking on it
// must not mint a credit out of thin air.
func TestBookingWithoutAPassRefundsNothing(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	var booking struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/bookings", token,
		map[string]any{"title": "โรงแรม", "partner": "agoda", "kind": models.BookingStay}).
		ExpectStatus(http.StatusCreated).
		Decode(&booking)
	h.Request(http.MethodPatch, "/api/v1/trips/"+trip.ID+"/bookings/"+booking.ID, token,
		map[string]any{"status": models.BookingBooked}).
		ExpectStatus(http.StatusOK)

	var codes int64
	if err := h.DB.Model(&models.DiscountCode{}).Where("user_id = ?", alice.ID).Count(&codes).Error; err != nil {
		t.Fatalf("count codes: %v", err)
	}
	if codes != 0 {
		t.Errorf("minted %d credits for a trip that was never paid for", codes)
	}
}

/* ------------------------------------------------- X26.2 — the free tier -- */

// The free tier plans one trip at a time (A26.3). This is the cap that decides
// whether anybody ever reaches the paywall, so it is worth pinning.
func TestFreeTierPlansOneTripAtATime(t *testing.T) {
	h := testsupport.New(t)
	_, token := h.User("alice")

	var first struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, "/api/v1/trips", token, map[string]any{"title": "ทริปแรก"}).
		ExpectStatus(http.StatusCreated).
		Decode(&first)

	h.Request(http.MethodPost, "/api/v1/trips", token, map[string]any{"title": "ทริปที่สอง"}).
		ExpectStatus(http.StatusPaymentRequired)

	// Paying for the first one frees the slot: the money for that trip has been
	// taken, and charging for the slot as well would be charging twice.
	buyPass(t, h, first.ID, token)
	h.Request(http.MethodPost, "/api/v1/trips", token, map[string]any{"title": "ทริปที่สอง"}).
		ExpectStatus(http.StatusCreated)
}

// A trip that is over stops counting: nobody should have to delete last year's
// holiday to plan the next one.
func TestFinishedTripsDoNotUseUpTheFreeSlot(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")

	done := h.Trip(alice, "ทริปที่จบแล้ว")
	if err := h.DB.Model(&models.Trip{}).Where("id = ?", done.ID).
		Update("status", models.TripStatusDone).Error; err != nil {
		t.Fatalf("close trip: %v", err)
	}

	h.Request(http.MethodPost, "/api/v1/trips", token, map[string]any{"title": "ทริปใหม่"}).
		ExpectStatus(http.StatusCreated)
}

func TestAnonymousCannotReachBilling(t *testing.T) {
	h := testsupport.New(t)

	for _, path := range []string{
		"/api/v1/users/me/billing/summary",
		"/api/v1/users/me/billing/orders",
		"/api/v1/users/me/billing/orders/anything",
		"/api/v1/users/me/billing/subscription",
		"/api/v1/users/me/billing/plans",
	} {
		t.Run(path, func(t *testing.T) {
			h.Request(http.MethodGet, path, "", nil).ExpectStatus(http.StatusUnauthorized)
		})
	}
}
