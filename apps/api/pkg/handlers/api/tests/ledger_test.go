package tests

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	ledgerstore "github.com/bboyzchecken/rove/apps/api/pkg/store/ledger"
	tripstore "github.com/bboyzchecken/rove/apps/api/pkg/store/trip"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// Feedback #4 — F12: every point and every baht traces back to what caused it,
// the ledger only grows, and anything it points at cannot be deleted.

func adminUser(h *testsupport.Harness, name string) (*models.User, string) {
	h.T.Helper()
	user, _ := h.User(name)
	user.Role = models.RoleAdmin
	if err := h.DB.Save(user).Error; err != nil {
		h.T.Fatalf("promote admin: %v", err)
	}
	token, err := h.Server.IssueToken(user)
	if err != nil {
		h.T.Fatalf("token: %v", err)
	}
	return user, token
}

type cloneFixture struct {
	creator, follower           *models.User
	creatorToken, followerToken string
	source, copy                *models.Trip
	booking                     *models.Booking
}

// clonedTripWithBooking copies a public trip through the real endpoint, so the
// clone event is recorded the way production records it.
func clonedTripWithBooking(t *testing.T, h *testsupport.Harness) cloneFixture {
	t.Helper()
	var f cloneFixture
	f.creator, f.creatorToken = h.User("creator")
	f.follower, f.followerToken = h.User("follower")
	f.source = h.Trip(f.creator, "โตเกียวต้นฉบับ")
	h.AddMember(f.source, f.follower, models.TripRoleViewer)

	var copied struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodPost, "/api/v1/trips/"+f.source.ID+"/clone", f.followerToken, nil).
		ExpectStatus(http.StatusCreated).Decode(&copied)
	f.copy = &models.Trip{}
	if err := h.DB.Where("id = ?", copied.ID).First(f.copy).Error; err != nil {
		t.Fatalf("load copy: %v", err)
	}

	f.booking = &models.Booking{
		TripID: f.copy.ID, Kind: models.BookingStay, Title: "โรงแรมชินจูกุ",
		Partner: "agoda", Status: models.BookingIdea,
	}
	if err := h.DB.Create(f.booking).Error; err != nil {
		t.Fatalf("booking: %v", err)
	}
	return f
}

func clickFor(t *testing.T, h *testsupport.Harness, tripID, bookingID, token string) string {
	t.Helper()
	var link struct {
		URL string `json:"url"`
	}
	h.Request(http.MethodPost, "/api/v1/trips/"+tripID+"/bookings/"+bookingID+"/link", token, nil).
		ExpectStatus(http.StatusOK).Decode(&link)
	return strings.TrimPrefix(link.URL, h.Config.AppBaseURL+"/go/")
}

func postback(h *testsupport.Harness, clickID, status string, amount float64) *testsupport.Response {
	return h.RequestWithHeaders(http.MethodPost, "/webhooks/affiliate/agoda",
		map[string]string{"X-Rove-Signature": h.Config.AffiliateWebhookSecret},
		map[string]any{"tracking_id": clickID, "status": status, "amount_thb": amount},
	)
}

type traceBody struct {
	Nodes []struct {
		ID       string          `json:"id"`
		Kind     string          `json:"kind"`
		ParentID *string         `json:"parent_id"`
		Matched  bool            `json:"matched"`
		Snapshot json.RawMessage `json:"snapshot"`
		Trips    []struct {
			ID       string `json:"id"`
			Archived bool   `json:"archived"`
		} `json:"trips"`
		Points []struct {
			ID    string `json:"id"`
			Delta int    `json:"delta"`
		} `json:"points"`
		Earnings []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"earnings"`
		Flags []struct {
			ID string `json:"id"`
		} `json:"flags"`
	} `json:"nodes"`
}

func (b traceBody) kinds() map[string]int {
	out := map[string]int{}
	for _, n := range b.Nodes {
		out[n.Kind]++
	}
	return out
}

func TestConfirmedBookingChainsBackToTheCloneItCameFrom(t *testing.T) {
	h := testsupport.New(t)
	f := clonedTripWithBooking(t, h)
	_, adminToken := adminUser(h, "admin")

	clickID := clickFor(t, h, f.copy.ID, f.booking.ID, f.followerToken)
	postback(h, clickID, "confirmed", 48_000).ExpectStatus(http.StatusOK)

	var earning models.CreatorEarning
	if err := h.DB.Where("user_id = ?", f.creator.ID).First(&earning).Error; err != nil {
		t.Fatalf("no earning: %v", err)
	}
	if earning.SourceID == nil {
		t.Fatal("earning has no source")
	}

	var trace traceBody
	h.Request(http.MethodGet, "/api/v1/admin/trace?type=earning&q="+earning.ID, adminToken, nil).
		ExpectStatus(http.StatusOK).Decode(&trace)

	kinds := trace.kinds()
	for _, want := range []string{models.SourceClone, models.SourceBookingClick, models.SourcePartnerConfirmed} {
		if kinds[want] != 1 {
			t.Errorf("trace kinds = %v, want one %s", kinds, want)
		}
	}
	for _, n := range trace.Nodes {
		if n.Kind == models.SourceClone && !strings.Contains(string(n.Snapshot), "โตเกียวต้นฉบับ") {
			t.Errorf("clone snapshot lost the source trip's title: %s", n.Snapshot)
		}
	}

	// No flat 480 points for the creator on a booking any more (D-30).
	var bookingPoints int64
	h.DB.Model(&models.UserPoints{}).Where("user_id = ? AND reason = ?", f.creator.ID, "booking_confirmed").Count(&bookingPoints)
	if bookingPoints != 0 {
		t.Errorf("creator got %d booking point rows, want none", bookingPoints)
	}

	// A retried postback pays nothing twice.
	postback(h, clickID, "confirmed", 48_000).ExpectStatus(http.StatusOK)
	var sources int64
	h.DB.Model(&models.ValueSource{}).Where("kind = ?", models.SourcePartnerConfirmed).Count(&sources)
	if sources != 1 {
		t.Errorf("confirmations recorded = %d, want 1", sources)
	}
}

func TestCancelBeforePayoutReversesAndVoids(t *testing.T) {
	h := testsupport.New(t)
	f := clonedTripWithBooking(t, h)

	clickID := clickFor(t, h, f.copy.ID, f.booking.ID, f.followerToken)
	postback(h, clickID, "confirmed", 48_000).ExpectStatus(http.StatusOK)
	postback(h, clickID, "cancelled", 48_000).ExpectStatus(http.StatusOK)

	var earning models.CreatorEarning
	h.DB.Where("user_id = ?", f.creator.ID).First(&earning)
	if earning.Status != models.EarningReversed {
		t.Errorf("earning status = %s, want reversed", earning.Status)
	}
	var events int64
	h.DB.Model(&models.EarningEvent{}).Where("earning_id = ?", earning.ID).Count(&events)
	if events != 2 {
		t.Errorf("earning events = %d, want created + reversed", events)
	}

	var credit models.DiscountCode
	if err := h.DB.Where("user_id = ?", f.follower.ID).First(&credit).Error; err != nil {
		t.Fatalf("no booker credit: %v", err)
	}
	if credit.VoidedAt == nil {
		t.Error("an unspent booker credit survived the cancellation")
	}

	var flags int64
	h.DB.Model(&models.LedgerFlag{}).Count(&flags)
	if flags != 0 {
		t.Errorf("flags = %d, want none — nothing had left yet", flags)
	}
}

func TestCancelAfterPayoutIsFlaggedNotReversed(t *testing.T) {
	h := testsupport.New(t)
	f := clonedTripWithBooking(t, h)
	admin, _ := adminUser(h, "admin")

	clickID := clickFor(t, h, f.copy.ID, f.booking.ID, f.followerToken)
	postback(h, clickID, "confirmed", 48_000).ExpectStatus(http.StatusOK)

	var earning models.CreatorEarning
	h.DB.Where("user_id = ?", f.creator.ID).First(&earning)
	for _, to := range []string{models.EarningPayable, models.EarningPaid} {
		from := map[string]string{models.EarningPayable: models.EarningPending, models.EarningPaid: models.EarningPayable}[to]
		if ok, err := ledgerstore.New(h.DB).TransitionEarning(t.Context(), earning.ID, []string{from}, to, &admin.ID, "test", ""); err != nil || !ok {
			t.Fatalf("move to %s: ok=%v err=%v", to, ok, err)
		}
	}

	postback(h, clickID, "cancelled", 48_000).ExpectStatus(http.StatusOK)

	h.DB.Where("id = ?", earning.ID).First(&earning)
	if earning.Status != models.EarningPaid {
		t.Errorf("paid earning was changed to %s", earning.Status)
	}
	var flag models.LedgerFlag
	if err := h.DB.Where("subject_id = ?", earning.ID).First(&flag).Error; err != nil {
		t.Fatalf("no flag for a cancellation after payout (D-36): %v", err)
	}
}

func TestAdminAdjustmentReversesWithAReasonAndAnAuditTrail(t *testing.T) {
	h := testsupport.New(t)
	f := clonedTripWithBooking(t, h)
	_, adminToken := adminUser(h, "admin")

	var clonePoints models.UserPoints
	if err := h.DB.Where("user_id = ? AND reason = ?", f.creator.ID, models.PointsReasonClone).First(&clonePoints).Error; err != nil {
		t.Fatalf("no clone points: %v", err)
	}

	h.Request(http.MethodPost, "/api/v1/admin/ledger/adjust", adminToken, map[string]any{
		"target_type": "points", "target_id": clonePoints.ID, "amount": -clonePoints.Delta,
	}).ExpectStatus(http.StatusBadRequest)

	h.Request(http.MethodPost, "/api/v1/admin/ledger/adjust", adminToken, map[string]any{
		"target_type": "points", "target_id": clonePoints.ID, "amount": -clonePoints.Delta,
		"reason": "คัดลอกทริปตัวเองจากบัญชีสำรอง", "reference": "ticket-12",
	}).ExpectStatus(http.StatusCreated)

	var reversal models.UserPoints
	if err := h.DB.Where("reverses_id = ?", clonePoints.ID).First(&reversal).Error; err != nil {
		t.Fatalf("no reversing row: %v", err)
	}
	if reversal.Delta != -clonePoints.Delta || reversal.SourceID == nil {
		t.Errorf("reversal = %+v", reversal)
	}
	var original models.UserPoints
	h.DB.Where("id = ?", clonePoints.ID).First(&original)
	if original.Delta != clonePoints.Delta {
		t.Error("the original row was edited instead of reversed")
	}

	var audits int64
	h.DB.Model(&models.AdminAuditLog{}).Where("action = ? AND target_id = ?", "ledger.adjust", clonePoints.ID).Count(&audits)
	if audits != 1 {
		t.Errorf("audit rows = %d, want 1", audits)
	}
}

func TestEconomySettingsApplyToTheNextBooking(t *testing.T) {
	h := testsupport.New(t)
	f := clonedTripWithBooking(t, h)
	_, adminToken := adminUser(h, "admin")

	h.Request(http.MethodPut, "/api/v1/admin/settings/economy", adminToken, map[string]any{
		"creator_share_percent": 60, "booker_credit_percent": 8,
	}).ExpectStatus(http.StatusBadRequest)
	h.Request(http.MethodPut, "/api/v1/admin/settings/economy", adminToken, map[string]any{
		"creator_share_percent": 20, "booker_credit_percent": 0,
	}).ExpectStatus(http.StatusOK)

	clickID := clickFor(t, h, f.copy.ID, f.booking.ID, f.followerToken)
	postback(h, clickID, "confirmed", 48_000).ExpectStatus(http.StatusOK)

	var earning models.CreatorEarning
	h.DB.Where("user_id = ?", f.creator.ID).First(&earning)
	if earning.SharePercent != 20 || earning.AmountTHB != 480 {
		t.Errorf("earning = %d%% ฿%.2f, want 20%% of ฿2,400", earning.SharePercent, earning.AmountTHB)
	}
	var credits int64
	h.DB.Model(&models.DiscountCode{}).Where("user_id = ?", f.follower.ID).Count(&credits)
	if credits != 0 {
		t.Errorf("booker credit issued at 0%%: %d", credits)
	}
}

func TestRepublishingDoesNotPayThePublishBonusAgain(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "อลิซไปโตเกียว")
	path := "/api/v1/trips/" + trip.ID + "/visibility"

	for _, v := range []string{"public", "private", "public"} {
		h.Request(http.MethodPatch, path, token, map[string]any{"visibility": v}).ExpectStatus(http.StatusOK)
	}

	var rows int64
	h.DB.Model(&models.UserPoints{}).Where("user_id = ? AND reason = ?", alice.ID, models.PointsReasonPublish).Count(&rows)
	if rows != 1 {
		t.Errorf("publish bonus paid %d times, want once", rows)
	}
}

/* -------------------------------------------------------------- archive -- */

func TestTripsGoToTheArchiveBeforeTheyCanBeDeleted(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "ทริปทดลอง")
	base := "/api/v1/trips/" + trip.ID

	var conflict struct {
		Archivable bool `json:"archivable"`
		Tied       bool `json:"tied"`
	}
	h.Request(http.MethodDelete, base, token, nil).ExpectStatus(http.StatusConflict).Decode(&conflict)
	if !conflict.Archivable || conflict.Tied {
		t.Errorf("conflict = %+v, want archive-first", conflict)
	}

	h.Request(http.MethodPost, base+"/archive", token, nil).ExpectStatus(http.StatusNoContent)
	h.Request(http.MethodGet, base, token, nil).ExpectStatus(http.StatusGone)

	var list struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	h.Request(http.MethodGet, "/api/v1/trips", token, nil).ExpectStatus(http.StatusOK).Decode(&list)
	for _, item := range list.Items {
		if item.ID == trip.ID {
			t.Error("archived trip is still in the trip list")
		}
	}

	var archive []struct {
		ID        string `json:"id"`
		CanDelete bool   `json:"can_delete"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/archive", token, nil).ExpectStatus(http.StatusOK).Decode(&archive)
	if len(archive) != 1 || archive[0].ID != trip.ID || !archive[0].CanDelete {
		t.Fatalf("archive = %+v", archive)
	}

	h.Request(http.MethodPost, base+"/restore", token, nil).ExpectStatus(http.StatusNoContent)
	h.Request(http.MethodGet, base, token, nil).ExpectStatus(http.StatusOK)

	h.Request(http.MethodPost, base+"/archive", token, nil).ExpectStatus(http.StatusNoContent)
	h.Request(http.MethodDelete, base, token, nil).ExpectStatus(http.StatusNoContent)
}

func TestArchivingAPublicTripUnpublishesItAndFreesTheSlot(t *testing.T) {
	h := testsupport.New(t)
	alice, token := h.User("alice")
	trip := h.Trip(alice, "โตเกียวสาธารณะ")
	base := "/api/v1/trips/" + trip.ID

	var share struct {
		Slug *string `json:"public_slug"`
	}
	h.Request(http.MethodPatch, base+"/visibility", token, map[string]any{"visibility": "public"}).
		ExpectStatus(http.StatusOK).Decode(&share)
	if share.Slug == nil {
		t.Fatal("no slug after publishing")
	}

	h.Request(http.MethodPost, base+"/archive", token, nil).ExpectStatus(http.StatusNoContent)
	h.Request(http.MethodGet, "/api/v1/public/trips/"+*share.Slug, "", nil).ExpectStatus(http.StatusNotFound)

	var reloaded models.Trip
	h.DB.Where("id = ?", trip.ID).First(&reloaded)
	if reloaded.Visibility != models.VisibilityPrivate {
		t.Errorf("visibility = %s, want private (D-33)", reloaded.Visibility)
	}

	ids, err := tripstore.New(h.DB).ActiveOwnedIDs(t.Context(), alice.ID)
	if err != nil || len(ids) != 0 {
		t.Errorf("active owned = %v err=%v — an archived trip must not use the free slot (D-34)", ids, err)
	}

	// Published once → points → tied: it can never be deleted, only kept.
	var conflict struct {
		Tied bool `json:"tied"`
	}
	h.Request(http.MethodDelete, base, token, nil).ExpectStatus(http.StatusConflict).Decode(&conflict)
	if !conflict.Tied {
		t.Error("a trip that earned points was deletable")
	}
}

func TestConfirmedBookingIsArchivedNotDeleted(t *testing.T) {
	h := testsupport.New(t)
	f := clonedTripWithBooking(t, h)
	base := "/api/v1/trips/" + f.copy.ID + "/bookings"

	clickID := clickFor(t, h, f.copy.ID, f.booking.ID, f.followerToken)
	postback(h, clickID, "confirmed", 12_000).ExpectStatus(http.StatusOK)

	var list []struct {
		ID   string `json:"id"`
		Tied bool   `json:"tied"`
	}
	h.Request(http.MethodGet, base, f.followerToken, nil).ExpectStatus(http.StatusOK).Decode(&list)
	if len(list) != 1 || !list[0].Tied {
		t.Fatalf("bookings = %+v, want the booking marked tied", list)
	}

	h.Request(http.MethodDelete, base+"/"+f.booking.ID, f.followerToken, nil).ExpectStatus(http.StatusConflict)
	h.Request(http.MethodPost, base+"/"+f.booking.ID+"/archive", f.followerToken, nil).ExpectStatus(http.StatusNoContent)

	list = nil
	h.Request(http.MethodGet, base, f.followerToken, nil).ExpectStatus(http.StatusOK).Decode(&list)
	if len(list) != 0 {
		t.Errorf("archived booking still listed: %+v", list)
	}
	list = nil
	h.Request(http.MethodGet, base+"/archived", f.followerToken, nil).ExpectStatus(http.StatusOK).Decode(&list)
	if len(list) != 1 {
		t.Errorf("archived list = %+v", list)
	}

	h.Request(http.MethodPost, base+"/"+f.booking.ID+"/restore", f.followerToken, nil).ExpectStatus(http.StatusNoContent)

	// A booking nobody confirmed is still an ordinary delete.
	plain := &models.Booking{TripID: f.copy.ID, Kind: models.BookingStay, Title: "ไอเดีย", Partner: "agoda", Status: models.BookingIdea}
	h.DB.Create(plain)
	h.Request(http.MethodDelete, base+"/"+plain.ID, f.followerToken, nil).ExpectStatus(http.StatusNoContent)
}

func TestBackfillGivesOldRowsALegacySource(t *testing.T) {
	h := testsupport.New(t)
	alice, _ := h.User("alice")
	trip := h.Trip(alice, "ทริปเก่า")

	old := models.UserPoints{UserID: alice.ID, Delta: 500, Reason: models.PointsReasonPublish, Note: "เปิดสาธารณะ", TripID: &trip.ID}
	if err := h.DB.Create(&old).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := core.BackfillLegacySources(h.DB); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	h.DB.Where("id = ?", old.ID).First(&old)
	if old.SourceID == nil {
		t.Fatal("old row still has no source")
	}
	var source models.ValueSource
	h.DB.Where("id = ?", *old.SourceID).First(&source)
	if source.Kind != models.SourceLegacy || !strings.Contains(string(source.Snapshot), "ทริปเก่า") {
		t.Errorf("source = %s %s", source.Kind, source.Snapshot)
	}
}
