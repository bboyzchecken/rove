package tests

import (
	"net/http"
	"testing"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// A20 — bill & payment.
//
// Two properties are worth a test here and they are both about damage: a
// receipt names what someone bought, so it must not be readable by anyone else;
// and the history has to be a faithful record of what was actually taken, so a
// purchase that granted drafts and spent points has to show both.

type receiptBody struct {
	ID          string  `json:"id"`
	Number      string  `json:"number"`
	Kind        string  `json:"kind"`
	Status      string  `json:"status"`
	Method      string  `json:"method"`
	TotalTHB    float64 `json:"total_thb"`
	SubtotalTHB float64 `json:"subtotal_thb"`
	PointsSpent int     `json:"points_spent"`
	Simulated   bool    `json:"simulated"`
	TripID      *string `json:"trip_id"`
	Lines       []struct {
		Quantity int `json:"quantity"`
	} `json:"lines"`
}

type purchaseBody struct {
	Extra int          `json:"extra"`
	Order *receiptBody `json:"order"`
}

type summaryBody struct {
	Orders            int     `json:"orders"`
	AIDraftsPurchased int     `json:"ai_drafts_purchased"`
	TotalSpentTHB     float64 `json:"total_spent_thb"`
	PointsSpent       int     `json:"points_spent"`
	Subscription      struct {
		PlanID string `json:"plan_id"`
		Status string `json:"status"`
	} `json:"subscription"`
}

// grantPoints tops up a balance the same way the ledger does, so the purchase
// under test takes the real path rather than a seeded shortcut.
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

func TestBuyingDraftsLeavesAReceipt(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	var purchase purchaseBody
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", token,
		map[string]any{"quantity": 2, "method": domain.PayMethodPromptPay, "channel": "พร้อมเพย์ (QR)"}).
		ExpectStatus(http.StatusOK).
		Decode(&purchase)

	if purchase.Extra != 2 {
		t.Fatalf("extra drafts = %d, want 2", purchase.Extra)
	}
	if purchase.Order == nil {
		t.Fatal("purchase returned no receipt")
	}

	order := purchase.Order
	if order.Number == "" {
		t.Error("receipt has no number")
	}
	if order.Status != domain.OrderPaid || order.Kind != domain.OrderKindAICredit {
		t.Errorf("receipt = %s/%s, want paid/ai_credit", order.Status, order.Kind)
	}
	if order.TotalTHB != float64(domain.PricePerDraftTHB*2) {
		t.Errorf("total = %.2f, want %d", order.TotalTHB, domain.PricePerDraftTHB*2)
	}
	// No gateway in Phase 1: a cash order must say so on its face (§16).
	if !order.Simulated {
		t.Error("cash order is not flagged simulated while there is no gateway")
	}
	if order.TripID == nil || *order.TripID != trip.ID {
		t.Error("receipt does not name the trip it was bought for")
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

// A receipt names what someone bought. It is nobody else's to read, and the
// refusal must not confirm that the id exists.
func TestReceiptIsNotReadableByAnotherUser(t *testing.T) {
	h := testsupport.New(t)
	alice, aliceToken := h.User("alice")
	_, bobToken := h.User("bob")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	var purchase purchaseBody
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", aliceToken,
		map[string]any{"quantity": 1, "method": domain.PayMethodCard, "channel": "บัตรเครดิต"}).
		ExpectStatus(http.StatusOK).
		Decode(&purchase)

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

// Points are not baht. An order paid with them costs ฿0 and 300 points, and the
// summary has to report both rather than folding one into the other.
func TestPointsPurchaseIsRecordedAsPointsNotCash(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	grantPoints(t, h, alice.ID, domain.PointsPerAIDraft)

	var purchase purchaseBody
	h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", token,
		map[string]any{"quantity": 1, "method": domain.PayMethodPoints, "channel": "300 แต้ม ROVE"}).
		ExpectStatus(http.StatusOK).
		Decode(&purchase)

	order := purchase.Order
	if order == nil {
		t.Fatal("purchase returned no receipt")
	}
	if order.TotalTHB != 0 {
		t.Errorf("total = %.2f, want 0 for a points purchase", order.TotalTHB)
	}
	// The line keeps its list price so the receipt still says what it was worth.
	if order.SubtotalTHB != float64(domain.PricePerDraftTHB) {
		t.Errorf("subtotal = %.2f, want %d", order.SubtotalTHB, domain.PricePerDraftTHB)
	}
	if order.PointsSpent != domain.PointsPerAIDraft {
		t.Errorf("points spent = %d, want %d", order.PointsSpent, domain.PointsPerAIDraft)
	}
	// Nothing was charged, so nothing may be flagged as an uncharged charge.
	if order.Simulated {
		t.Error("points purchase flagged simulated — the points really were spent")
	}

	var summary summaryBody
	h.Request(http.MethodGet, "/api/v1/users/me/billing/summary", token, nil).
		ExpectStatus(http.StatusOK).
		Decode(&summary)

	if summary.TotalSpentTHB != 0 {
		t.Errorf("cash total = %.2f, want 0", summary.TotalSpentTHB)
	}
	if summary.PointsSpent != domain.PointsPerAIDraft {
		t.Errorf("points total = %d, want %d", summary.PointsSpent, domain.PointsPerAIDraft)
	}
}

// "ซื้อ AI ไปกี่ครั้ง" counts drafts, not receipts: one order for three drafts
// is three.
func TestSummaryCountsDraftsNotOrders(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")

	for _, quantity := range []int{3, 1} {
		h.Request(http.MethodPost, "/api/v1/trips/"+trip.ID+"/ai/credits/purchase", token,
			map[string]any{"quantity": quantity, "method": domain.PayMethodCard, "channel": "บัตรเครดิต"}).
			ExpectStatus(http.StatusOK)
	}

	var summary summaryBody
	h.Request(http.MethodGet, "/api/v1/users/me/billing/summary", token, nil).
		ExpectStatus(http.StatusOK).
		Decode(&summary)

	if summary.Orders != 2 {
		t.Errorf("orders = %d, want 2", summary.Orders)
	}
	if summary.AIDraftsPurchased != 4 {
		t.Errorf("drafts purchased = %d, want 4", summary.AIDraftsPurchased)
	}
	if summary.TotalSpentTHB != float64(domain.PricePerDraftTHB*4) {
		t.Errorf("total = %.2f, want %d", summary.TotalSpentTHB, domain.PricePerDraftTHB*4)
	}
	// Nobody is subscribed yet, and the free plan is an answer rather than a row.
	if summary.Subscription.PlanID != domain.FreePlanID || summary.Subscription.Status != "none" {
		t.Errorf("subscription = %s/%s, want free/none",
			summary.Subscription.PlanID, summary.Subscription.Status)
	}
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
