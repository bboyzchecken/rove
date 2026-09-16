package tests

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/testsupport"
)

// Feedback #4 — F11: เปิดรับรายได้, payout cycles and the 180-day hold.

const validThaiID = "1101700230708"

// otherValidThaiID is a second checksum-valid number.
func otherValidThaiID() string {
	base := "310050012345"
	sum := 0
	for i := 0; i < 12; i++ {
		sum += int(base[i]-'0') * (13 - i)
	}
	return base + string(rune('0'+(11-sum%11)%10))
}

func multipartRequest(h *testsupport.Harness, path, token string, fields map[string]string, files map[string][]byte) *httptest.ResponseRecorder {
	h.T.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	for field, content := range files {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", `form-data; name="`+field+`"; filename="`+field+`.jpg"`)
		header.Set("Content-Type", "image/jpeg")
		part, _ := w.CreatePart(header)
		_, _ = part.Write(content)
	}
	_ = w.Close()

	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set(echo.HeaderContentType, w.FormDataContentType())
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	h.Server.Echo().ServeHTTP(rec, req)
	return rec
}

type verificationBody struct {
	Status        string   `json:"status"`
	PhoneVerified bool     `json:"phone_verified"`
	EmailVerified bool     `json:"email_verified"`
	EditableSteps []string `json:"editable_steps"`
	RejectedSteps []string `json:"rejected_steps"`
	Verified      bool     `json:"verified"`
	Steps         struct {
		Basic, Identity, Documents, Account bool
	} `json:"steps"`
}

const me = "/api/v1/users/me/verification"

func verifyChannel(t *testing.T, h *testsupport.Harness, token, channel string) {
	t.Helper()
	var sent struct {
		DevCode string `json:"dev_code"`
	}
	h.Request(http.MethodPost, me+"/otp", token, map[string]any{"channel": channel}).
		ExpectStatus(http.StatusOK).Decode(&sent)
	if sent.DevCode == "" {
		t.Fatal("no dev code outside production")
	}
	h.Request(http.MethodPost, me+"/otp/verify", token, map[string]any{"channel": channel, "code": "000000x"}).
		ExpectStatus(http.StatusBadRequest)
	h.Request(http.MethodPost, me+"/otp/verify", token, map[string]any{"channel": channel, "code": sent.DevCode}).
		ExpectStatus(http.StatusOK)
}

// completeVerification walks all four steps and submits.
func completeVerification(t *testing.T, h *testsupport.Harness, token, legalName, idNumber, accountNumber string) {
	t.Helper()
	h.Request(http.MethodPut, me+"/basic", token, map[string]any{
		"legal_type": "individual", "legal_name": legalName, "phone": "081-234-5678", "email": "creator@example.com",
	}).ExpectStatus(http.StatusOK)
	verifyChannel(t, h, token, "phone")
	verifyChannel(t, h, token, "email")

	h.Request(http.MethodPut, me+"/identity", token, map[string]any{"id_number": idNumber}).ExpectStatus(http.StatusOK)

	rec := multipartRequest(h, me+"/documents", token, nil, map[string][]byte{"id_card": []byte("jpg"), "selfie": []byte("jpg")})
	if rec.Code != http.StatusOK {
		t.Fatalf("documents = %d %s", rec.Code, rec.Body.String())
	}

	h.Request(http.MethodPut, me+"/account", token, map[string]any{
		"kind": "bank", "bank_code": "KBANK", "account_number": accountNumber, "account_name": legalName,
	}).ExpectStatus(http.StatusOK)

	var out verificationBody
	h.Request(http.MethodPost, me+"/submit", token, nil).ExpectStatus(http.StatusOK).Decode(&out)
	if out.Status != models.KYCSubmitted {
		t.Fatalf("status after submit = %s", out.Status)
	}
}

func verificationID(t *testing.T, h *testsupport.Harness, userID string) string {
	t.Helper()
	var v models.CreatorVerification
	if err := h.DB.Where("user_id = ?", userID).First(&v).Error; err != nil {
		t.Fatalf("no verification: %v", err)
	}
	return v.ID
}

func TestVerificationFlowEndsWithABadge(t *testing.T) {
	h := testsupport.New(t)
	creator, token := h.User("creator")
	_, adminToken := adminUser(h, "admin")

	h.Request(http.MethodPost, me+"/submit", token, nil).ExpectStatus(http.StatusBadRequest)
	completeVerification(t, h, token, "สมชาย ใจดี", validThaiID, "1234567890")

	// Sealed at rest.
	var stored models.CreatorVerification
	h.DB.Where("user_id = ?", creator.ID).First(&stored)
	if stored.IDNumberSealed == "" || bytes.Contains([]byte(stored.IDNumberSealed), []byte(validThaiID)) {
		t.Errorf("ID number is not sealed: %q", stored.IDNumberSealed)
	}

	var detail struct {
		IDNumber  string  `json:"id_number"`
		IDCardURL *string `json:"id_card_url"`
		Account   *struct {
			Number string `json:"number"`
		} `json:"account"`
	}
	h.Request(http.MethodGet, "/api/v1/admin/kyc/"+stored.ID, adminToken, nil).ExpectStatus(http.StatusOK).Decode(&detail)
	if detail.IDNumber != validThaiID || detail.IDCardURL == nil || detail.Account == nil || detail.Account.Number != "1234567890" {
		t.Errorf("admin detail = %+v", detail)
	}

	h.Request(http.MethodPost, "/api/v1/admin/kyc/"+stored.ID+"/approve", adminToken, nil).ExpectStatus(http.StatusNoContent)

	var meBody struct {
		Verified bool `json:"verified"`
	}
	h.Request(http.MethodGet, "/api/v1/auth/me", token, nil).ExpectStatus(http.StatusOK).Decode(&meBody)
	if !meBody.Verified {
		t.Error("approved creator has no badge on /users/me")
	}
	var account models.PayoutAccount
	h.DB.Where("user_id = ?", creator.ID).First(&account)
	if account.Status != models.AccountVerified {
		t.Errorf("account = %s, want verified with the approval", account.Status)
	}
	var audits int64
	h.DB.Model(&models.AdminAuditLog{}).Where("target_id = ? AND action IN ?", stored.ID, []string{"kyc.view", "kyc.approve"}).Count(&audits)
	if audits != 2 {
		t.Errorf("audit rows = %d, want view + approve", audits)
	}

	// Verified: only the account can change, and a new one waits for an admin.
	h.Request(http.MethodPut, me+"/identity", token, map[string]any{"id_number": validThaiID}).ExpectStatus(http.StatusConflict)
	h.Request(http.MethodPut, me+"/account", token, map[string]any{
		"kind": "promptpay", "account_number": "0812345678", "account_name": "สมชาย ใจดี",
	}).ExpectStatus(http.StatusOK)
	var pending []struct {
		ID string `json:"id"`
	}
	h.Request(http.MethodGet, "/api/v1/admin/payout-accounts/pending", adminToken, nil).ExpectStatus(http.StatusOK).Decode(&pending)
	if len(pending) != 1 {
		t.Errorf("pending account changes = %d, want 1", len(pending))
	}
}

func TestOneIDCardOneCreatorAccount(t *testing.T) {
	h := testsupport.New(t)
	_, first := h.User("first")
	_, squatter := h.User("squatter")

	// Someone typing a stranger's ID into their own draft must not lock the
	// real owner out — a draft is not a claim.
	h.Request(http.MethodPut, me+"/basic", squatter, map[string]any{
		"legal_name": "คนแอบอ้าง จริงจริง", "phone": "0822222222", "email": "b@example.com",
	}).ExpectStatus(http.StatusOK)
	h.Request(http.MethodPut, me+"/identity", squatter, map[string]any{"id_number": validThaiID}).ExpectStatus(http.StatusOK)

	completeVerification(t, h, first, "คนแรก จริงจริง", validThaiID, "1111111111")

	// Once submitted, the number is taken.
	h.Request(http.MethodPut, me+"/identity", squatter, map[string]any{"id_number": validThaiID}).ExpectStatus(http.StatusConflict)
	h.Request(http.MethodPut, me+"/identity", squatter, map[string]any{"id_number": "1234567890123"}).ExpectStatus(http.StatusBadRequest)
}

func TestRejectionReopensOnlyTheNamedSteps(t *testing.T) {
	h := testsupport.New(t)
	creator, token := h.User("creator")
	_, adminToken := adminUser(h, "admin")
	completeVerification(t, h, token, "สมหญิง รักดี", otherValidThaiID(), "9876543210")
	id := verificationID(t, h, creator.ID)

	h.Request(http.MethodPost, "/api/v1/admin/kyc/"+id+"/reject", adminToken, map[string]any{
		"steps": []string{"documents"},
	}).ExpectStatus(http.StatusBadRequest)
	h.Request(http.MethodPost, "/api/v1/admin/kyc/"+id+"/reject", adminToken, map[string]any{
		"steps": []string{"documents"}, "reason": "เซลฟี่เบลอ มองไม่เห็นหน้าบัตร",
	}).ExpectStatus(http.StatusNoContent)

	var out verificationBody
	h.Request(http.MethodGet, me, token, nil).ExpectStatus(http.StatusOK).Decode(&out)
	if out.Status != models.KYCRejected || len(out.EditableSteps) != 1 || out.EditableSteps[0] != "documents" {
		t.Fatalf("after reject = %+v", out)
	}

	h.Request(http.MethodPut, me+"/basic", token, map[string]any{
		"legal_name": "ชื่อใหม่ ใหม่", "phone": "0811111111", "email": "x@example.com",
	}).ExpectStatus(http.StatusConflict)

	rec := multipartRequest(h, me+"/documents", token, nil, map[string][]byte{"selfie": []byte("jpg2")})
	if rec.Code != http.StatusOK {
		t.Fatalf("re-upload = %d", rec.Code)
	}
	h.Request(http.MethodPost, me+"/submit", token, nil).ExpectStatus(http.StatusOK)

	var notices int64
	h.DB.Model(&models.Notification{}).Where("user_id = ? AND kind = ?", creator.ID, models.NotifyKYC).Count(&notices)
	if notices != 1 {
		t.Errorf("kyc notifications = %d, want the rejection", notices)
	}
}

/* ------------------------------------------------------------- cycles --- */

func nextTuesday() time.Time {
	day := domain.Day(time.Now().UTC()).AddDate(0, 0, 1)
	for day.Weekday() != time.Tuesday {
		day = day.AddDate(0, 0, 1)
	}
	return day
}

type overviewBody struct {
	AnchorDate *string `json:"anchor_date"`
	NextCycle  *struct {
		ID         string `json:"id"`
		CutoffDate string `json:"cutoff_date"`
		DueDate    string `json:"due_date"`
	} `json:"next_cycle"`
	PendingCount int `json:"pending_count"`
	Ready        []struct {
		UserID     string  `json:"user_id"`
		AmountTHB  float64 `json:"amount_thb"`
		WillBePaid bool    `json:"will_be_paid"`
	} `json:"ready"`
}

func TestCyclesStartFromTheAdminsTuesdayAndOnlyMoveEarlier(t *testing.T) {
	h := testsupport.New(t)
	_, adminToken := adminUser(h, "admin")

	var out overviewBody
	h.Request(http.MethodGet, "/api/v1/admin/payouts", adminToken, nil).ExpectStatus(http.StatusOK).Decode(&out)
	if out.AnchorDate != nil || out.NextCycle != nil {
		t.Fatalf("cycles exist before an anchor was set (D-40): %+v", out)
	}

	tuesday := nextTuesday()
	h.Request(http.MethodPut, "/api/v1/admin/payouts/anchor", adminToken, map[string]any{
		"anchor_date": tuesday.AddDate(0, 0, 1).Format("2006-01-02"),
	}).ExpectStatus(http.StatusBadRequest)
	h.Request(http.MethodPut, "/api/v1/admin/payouts/anchor", adminToken, map[string]any{
		"anchor_date": tuesday.Format("2006-01-02"),
	}).ExpectStatus(http.StatusOK).Decode(&out)
	if out.NextCycle == nil || out.NextCycle.CutoffDate != tuesday.Format("2006-01-02") ||
		out.NextCycle.DueDate != domain.DueDate(tuesday).Format("2006-01-02") {
		t.Fatalf("next cycle = %+v", out.NextCycle)
	}

	path := "/api/v1/admin/payouts/cycles/" + out.NextCycle.ID + "/move"
	h.Request(http.MethodPost, path, adminToken, map[string]any{
		"cutoff_date": tuesday.AddDate(0, 0, 3).Format("2006-01-02"), "reason": "ช้าลง",
	}).ExpectStatus(http.StatusBadRequest)
	h.Request(http.MethodPost, path, adminToken, map[string]any{
		"cutoff_date": tuesday.AddDate(0, 0, -1).Format("2006-01-02"), "reason": "",
	}).ExpectStatus(http.StatusBadRequest)
	if tuesday.AddDate(0, 0, -1).After(domain.Day(time.Now().UTC())) {
		h.Request(http.MethodPost, path, adminToken, map[string]any{
			"cutoff_date": tuesday.AddDate(0, 0, -1).Format("2006-01-02"), "reason": "วันหยุดยาว",
		}).ExpectStatus(http.StatusOK)
	}
}

func earningFor(t *testing.T, h *testsupport.Harness, userID string, amount float64, status string, occurred time.Time) *models.CreatorEarning {
	t.Helper()
	e := models.CreatorEarning{
		UserID: userID, TripID: "trip", Partner: "agoda", CommissionTHB: amount * 5,
		SharePercent: 15, AmountTHB: amount, Status: status, OccurredAt: occurred,
	}
	if err := h.DB.Create(&e).Error; err != nil {
		t.Fatalf("seed earning: %v", err)
	}
	return &e
}

func TestReconcileCloseAndPayOnlyVerifiedCreators(t *testing.T) {
	h := testsupport.New(t)
	_, adminToken := adminUser(h, "admin")
	verified, verifiedToken := h.User("verified")
	unverified, unverifiedToken := h.User("unverified")
	small, smallToken := h.User("small")

	completeVerification(t, h, verifiedToken, "ครีเอเตอร์ ยืนยันแล้ว", validThaiID, "1111111111")
	h.Request(http.MethodPost, "/api/v1/admin/kyc/"+verificationID(t, h, verified.ID)+"/approve", adminToken, nil).
		ExpectStatus(http.StatusNoContent)
	completeVerification(t, h, smallToken, "ครีเอเตอร์ ยอดน้อย", otherValidThaiID(), "2222222222")
	h.Request(http.MethodPost, "/api/v1/admin/kyc/"+verificationID(t, h, small.ID)+"/approve", adminToken, nil).
		ExpectStatus(http.StatusNoContent)

	now := time.Now().UTC()
	big := earningFor(t, h, verified.ID, 400, models.EarningPending, now)
	held := earningFor(t, h, unverified.ID, 500, models.EarningPending, now)
	tiny := earningFor(t, h, small.ID, 120, models.EarningPending, now)

	h.Request(http.MethodPut, "/api/v1/admin/payouts/anchor", adminToken, map[string]any{
		"anchor_date": nextTuesday().Format("2006-01-02"),
	}).ExpectStatus(http.StatusOK)

	h.Request(http.MethodPost, "/api/v1/admin/payouts/reconcile", adminToken, map[string]any{
		"earning_ids": []string{big.ID, held.ID, tiny.ID},
	}).ExpectStatus(http.StatusBadRequest)
	h.Request(http.MethodPost, "/api/v1/admin/payouts/reconcile", adminToken, map[string]any{
		"earning_ids": []string{big.ID, held.ID, tiny.ID}, "statement_ref": "AGODA-2026-09",
	}).ExpectStatus(http.StatusOK)

	var paidSources int64
	h.DB.Model(&models.ValueSource{}).Where("kind = ?", models.SourcePartnerPaid).Count(&paidSources)
	if paidSources != 3 {
		t.Errorf("partner_paid sources = %d", paidSources)
	}

	var out overviewBody
	h.Request(http.MethodGet, "/api/v1/admin/payouts", adminToken, nil).ExpectStatus(http.StatusOK).Decode(&out)
	will := map[string]bool{}
	for _, r := range out.Ready {
		will[r.UserID] = r.WillBePaid
	}
	if !will[verified.ID] || will[unverified.ID] || will[small.ID] {
		t.Errorf("will be paid = %v", will)
	}

	var closed struct {
		Payouts []struct {
			ID            string  `json:"id"`
			UserID        string  `json:"user_id"`
			AmountTHB     float64 `json:"amount_thb"`
			AccountNumber string  `json:"account_number"`
		} `json:"payouts"`
	}
	h.Request(http.MethodPost, "/api/v1/admin/payouts/cycles/"+out.NextCycle.ID+"/close", adminToken, nil).
		ExpectStatus(http.StatusOK).Decode(&closed)
	if len(closed.Payouts) != 1 || closed.Payouts[0].UserID != verified.ID || closed.Payouts[0].AccountNumber != "1111111111" {
		t.Fatalf("payouts = %+v, want only the verified creator above the minimum", closed.Payouts)
	}

	for id, want := range map[string]string{big.ID: models.EarningInPayout, held.ID: models.EarningPayable, tiny.ID: models.EarningPayable} {
		var e models.CreatorEarning
		h.DB.Where("id = ?", id).First(&e)
		if e.Status != want {
			t.Errorf("earning %.0f = %s, want %s", e.AmountTHB, e.Status, want)
		}
	}

	// A new open cycle is ready straight away.
	var after overviewBody
	h.Request(http.MethodGet, "/api/v1/admin/payouts", adminToken, nil).ExpectStatus(http.StatusOK).Decode(&after)
	if after.NextCycle == nil || after.NextCycle.ID == out.NextCycle.ID {
		t.Error("closing a cycle did not open the next one")
	}

	payoutPath := "/api/v1/admin/payouts/" + closed.Payouts[0].ID + "/paid"
	if rec := multipartRequest(h, payoutPath, adminToken, map[string]string{}, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("paid without a reference = %d", rec.Code)
	}
	if rec := multipartRequest(h, payoutPath, adminToken, map[string]string{"transfer_ref": "KB-778899"},
		map[string][]byte{"slip": []byte("jpg")}); rec.Code != http.StatusOK {
		t.Fatalf("mark paid = %d %s", rec.Code, rec.Body.String())
	}

	var statement struct {
		Totals struct {
			PaidTHB float64 `json:"paid_thb"`
		} `json:"totals"`
		Payouts []struct {
			TransferRef string  `json:"transfer_ref"`
			SlipURL     *string `json:"slip_url"`
		} `json:"payouts"`
		NextCycle *struct {
			CutoffDate string `json:"cutoff_date"`
		} `json:"next_cycle"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/earnings", verifiedToken, nil).ExpectStatus(http.StatusOK).Decode(&statement)
	if statement.Totals.PaidTHB != 400 || len(statement.Payouts) != 1 || statement.Payouts[0].TransferRef != "KB-778899" ||
		statement.Payouts[0].SlipURL == nil || statement.NextCycle == nil {
		t.Errorf("statement = %+v", statement)
	}

	var notices int64
	h.DB.Model(&models.Notification{}).Where("user_id = ? AND kind = ?", verified.ID, models.NotifyPayoutPaid).Count(&notices)
	if notices != 1 {
		t.Errorf("payout notifications = %d", notices)
	}

	var heldStatement struct {
		Verified bool `json:"verified"`
		Held     *struct {
			AmountTHB float64 `json:"amount_thb"`
		} `json:"held"`
	}
	h.Request(http.MethodGet, "/api/v1/users/me/earnings", unverifiedToken, nil).ExpectStatus(http.StatusOK).Decode(&heldStatement)
	if heldStatement.Verified || heldStatement.Held == nil || heldStatement.Held.AmountTHB != 500 {
		t.Errorf("held statement = %+v", heldStatement)
	}
}

func TestHeldIncomeWarnsOnceThenExpiresAfter180Days(t *testing.T) {
	h := testsupport.New(t)
	creator, token := h.User("creator")
	now := time.Now().UTC()

	old := earningFor(t, h, creator.ID, 300, models.EarningPayable, now.AddDate(0, 0, -181))
	soon := earningFor(t, h, creator.ID, 200, models.EarningPending, now.AddDate(0, 0, -170))
	fresh := earningFor(t, h, creator.ID, 100, models.EarningPending, now.AddDate(0, 0, -10))

	for i := 0; i < 2; i++ {
		h.Request(http.MethodGet, "/api/v1/users/me/earnings", token, nil).ExpectStatus(http.StatusOK)
	}

	for id, want := range map[string]string{old.ID: models.EarningExpired, soon.ID: models.EarningPending, fresh.ID: models.EarningPending} {
		var e models.CreatorEarning
		h.DB.Where("id = ?", id).First(&e)
		if e.Status != want {
			t.Errorf("earning ฿%.0f = %s, want %s", e.AmountTHB, e.Status, want)
		}
	}
	var expiredSources int64
	h.DB.Model(&models.ValueSource{}).Where("kind = ? AND subject_id = ?", models.SourceEarningExpired, old.ID).Count(&expiredSources)
	if expiredSources != 1 {
		t.Errorf("expiry sources = %d", expiredSources)
	}
	var warnings int64
	h.DB.Model(&models.Notification{}).Where("user_id = ? AND kind = ?", creator.ID, models.NotifyExpiring).Count(&warnings)
	if warnings != 1 {
		t.Errorf("expiry warnings = %d, want exactly one across two opens", warnings)
	}
}
