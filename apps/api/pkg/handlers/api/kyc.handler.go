package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/domain"
	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/sealbox"
)

// เปิดรับรายได้ — creator verification (Feedback #4 — F11, D-22, D-23, D-37 … D-39).
//
// Four steps, saved one at a time: who you are (with the phone and email
// proven by a code), your ID or tax number, a photo of the card and a selfie
// holding it, and the account the money goes to. An admin reviews the lot; a
// rejection names the steps to redo and only those open again.
func (s *Server) registerVerificationRoutes(me *echo.Group) {
	me.GET("/verification", s.handleGetVerification)
	me.PUT("/verification/basic", s.handleVerificationBasic)
	me.POST("/verification/otp", s.handleVerificationSendOTP)
	me.POST("/verification/otp/verify", s.handleVerificationCheckOTP)
	me.PUT("/verification/identity", s.handleVerificationIdentity)
	me.POST("/verification/documents", s.handleVerificationDocuments)
	me.PUT("/verification/account", s.handleVerificationAccount)
	me.POST("/verification/submit", s.handleVerificationSubmit)
}

var errKYCKey = errors.New("kyc: encryption key not configured")

// kycBox refuses to run production without its own key. Everywhere else a key
// is derived from the JWT secret, so a dev machine does not need one more env.
func (s *Server) kycBox() (*sealbox.Box, error) {
	key := s.cfg.KYCEncryptionKey
	if key == "" {
		if s.cfg.IsProduction() {
			return nil, errKYCKey
		}
		sum := sha256.Sum256([]byte("rove-dev-kyc:" + s.cfg.JwtSecret))
		key = hex.EncodeToString(sum[:])
	}
	return sealbox.New([]byte(key))
}

func (s *Server) kycBucket() string {
	if s.cfg.R2.KYCBucket != "" {
		return s.cfg.R2.KYCBucket
	}
	return "kyc"
}

/* ----------------------------------------------------------------- DTO --- */

type payoutAccountDTO struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	BankCode     string `json:"bank_code"`
	NumberLast4  string `json:"number_last4"`
	AccountName  string `json:"account_name"`
	Status       string `json:"status"`
	RejectReason string `json:"reject_reason"`
}

type verificationStepsDTO struct {
	Basic     bool `json:"basic"`
	Identity  bool `json:"identity"`
	Documents bool `json:"documents"`
	Account   bool `json:"account"`
}

type verificationDTO struct {
	Status        string               `json:"status"`
	LegalType     string               `json:"legal_type"`
	LegalName     string               `json:"legal_name"`
	Phone         string               `json:"phone"`
	PhoneVerified bool                 `json:"phone_verified"`
	Email         string               `json:"email"`
	EmailVerified bool                 `json:"email_verified"`
	IDNumberLast4 string               `json:"id_number_last4"`
	HasIDCard     bool                 `json:"has_id_card"`
	HasSelfie     bool                 `json:"has_selfie"`
	Account       *payoutAccountDTO    `json:"account"`
	Steps         verificationStepsDTO `json:"steps"`
	EditableSteps []string             `json:"editable_steps"`
	RejectedSteps []string             `json:"rejected_steps"`
	RejectReason  string               `json:"reject_reason"`
	SubmittedAt   *string              `json:"submitted_at"`
	ReviewedAt    *string              `json:"reviewed_at"`
	Verified      bool                 `json:"verified"`
	VerifiedAt    *string              `json:"verified_at"`
}

func toPayoutAccountDTO(a *models.PayoutAccount) *payoutAccountDTO {
	if a == nil {
		return nil
	}
	return &payoutAccountDTO{
		ID: a.ID, Kind: a.Kind, BankCode: a.BankCode, NumberLast4: a.NumberLast4,
		AccountName: a.AccountName, Status: a.Status, RejectReason: a.RejectReason,
	}
}

func rejectedSteps(v *models.CreatorVerification) []string {
	out := []string{}
	if len(v.RejectedSteps) > 0 {
		_ = json.Unmarshal(v.RejectedSteps, &out)
	}
	return out
}

func stepsOf(v *models.CreatorVerification, account *models.PayoutAccount) verificationStepsDTO {
	return verificationStepsDTO{
		Basic:     v.LegalName != "" && v.PhoneVerifiedAt != nil && v.EmailVerifiedAt != nil,
		Identity:  v.IDNumberHash != nil,
		Documents: v.IDCardKey != "" && v.SelfieKey != "",
		Account:   account != nil && account.Status != models.AccountRejected,
	}
}

// editableSteps is D-39 as a rule: a draft is all open, a rejection opens only
// what the admin named, a verified creator may only change where money goes.
func editableSteps(v *models.CreatorVerification) []string {
	switch v.Status {
	case models.KYCDraft:
		return slices.Clone(models.KYCSteps)
	case models.KYCRejected:
		return rejectedSteps(v)
	case models.KYCApproved:
		return []string{models.KYCStepAccount}
	default:
		return []string{}
	}
}

func (s *Server) verificationDTO(user *models.User, v *models.CreatorVerification, account *models.PayoutAccount) verificationDTO {
	return verificationDTO{
		Status: v.Status, LegalType: v.LegalType, LegalName: v.LegalName,
		Phone: v.Phone, PhoneVerified: v.PhoneVerifiedAt != nil,
		Email: v.Email, EmailVerified: v.EmailVerifiedAt != nil,
		IDNumberLast4: v.IDNumberLast4, HasIDCard: v.IDCardKey != "", HasSelfie: v.SelfieKey != "",
		Account:       toPayoutAccountDTO(account),
		Steps:         stepsOf(v, account),
		EditableSteps: editableSteps(v),
		RejectedSteps: rejectedSteps(v),
		RejectReason:  v.RejectReason,
		SubmittedAt:   timeString(v.SubmittedAt),
		ReviewedAt:    timeString(v.ReviewedAt),
		Verified:      user.VerifiedAt != nil,
		VerifiedAt:    timeString(user.VerifiedAt),
	}
}

// loadVerification returns the person's verification, starting a draft the
// first time they open the flow.
func (s *Server) loadVerification(c echo.Context) (*models.User, *models.CreatorVerification, *models.PayoutAccount, error) {
	ctx := c.Request().Context()
	userID := request.UserID(c)
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, nil, nil, err
	}
	v, err := s.kyc.GetByUser(ctx, userID)
	if err != nil {
		return nil, nil, nil, err
	}
	if v == nil {
		v = &models.CreatorVerification{
			UserID: userID, Status: models.KYCDraft, LegalType: models.LegalIndividual,
			Provider: models.KYCProviderManual,
		}
		if user.Email != nil {
			v.Email = *user.Email
			// A Google sign-in already proved the address.
			if user.Provider == models.ProviderGoogle {
				now := time.Now().UTC()
				v.EmailVerifiedAt = &now
			}
		}
	}
	account, err := s.kyc.CurrentAccount(ctx, userID)
	if err != nil {
		return nil, nil, nil, err
	}
	return user, v, account, nil
}

func (s *Server) respondVerification(c echo.Context, status int) error {
	user, v, account, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	return c.JSON(status, s.verificationDTO(user, v, account))
}

func stepLocked(v *models.CreatorVerification, step string) bool {
	return !slices.Contains(editableSteps(v), step)
}

func lockedStep(c echo.Context) error {
	return request.Error(c, http.StatusConflict, "ขั้นนี้แก้ไม่ได้ตอนนี้")
}

/* ------------------------------------------------------------ handlers --- */

func (s *Server) handleGetVerification(c echo.Context) error {
	return s.respondVerification(c, http.StatusOK)
}

type verificationBasicRequest struct {
	LegalType string `json:"legal_type"`
	LegalName string `json:"legal_name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
}

func (s *Server) handleVerificationBasic(c echo.Context) error {
	ctx := c.Request().Context()
	var req verificationBasicRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	user, v, _, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if stepLocked(v, models.KYCStepBasic) {
		return lockedStep(c)
	}

	legalType := orDefault(req.LegalType, models.LegalIndividual)
	if legalType != models.LegalIndividual && legalType != models.LegalJuristic {
		return request.BadRequest(c, "ประเภทผู้สมัครไม่ถูกต้อง")
	}
	name := strings.Join(strings.Fields(req.LegalName), " ")
	if len([]rune(name)) < 3 {
		return request.BadRequest(c, "กรอกชื่อ-นามสกุลจริงให้ตรงกับบัญชีธนาคาร")
	}
	phone := domain.NormalizeThaiPhone(req.Phone)
	if phone == "" {
		return request.BadRequest(c, "เบอร์โทรไม่ถูกต้อง")
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") || strings.ContainsAny(email, " \t") {
		return request.BadRequest(c, "อีเมลไม่ถูกต้อง")
	}

	if v.LegalType != legalType && v.IDNumberHash != nil {
		// The number was checked against the other type's rules.
		v.IDNumberHash, v.IDNumberSealed, v.IDNumberLast4 = nil, "", ""
	}
	v.LegalType, v.LegalName = legalType, name
	if v.Phone != phone {
		v.Phone, v.PhoneVerifiedAt = phone, nil
	}
	if v.Email != email {
		v.Email, v.EmailVerifiedAt = email, nil
		if user.Provider == models.ProviderGoogle && user.Email != nil && strings.EqualFold(*user.Email, email) {
			now := time.Now().UTC()
			v.EmailVerifiedAt = &now
		}
	}
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return s.respondVerification(c, http.StatusOK)
}

type otpRequest struct {
	Channel string `json:"channel"`
	Code    string `json:"code"`
}

type otpSentDTO struct {
	Channel   string `json:"channel"`
	ExpiresAt string `json:"expires_at"`
	// Only outside production, while SMS is a stub (D-29): UAT has no other way
	// to read the code.
	DevCode string `json:"dev_code,omitempty"`
}

func otpHash(userID, code string) string {
	sum := sha256.Sum256([]byte(userID + ":" + code))
	return hex.EncodeToString(sum[:])
}

func newOTPCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func (s *Server) handleVerificationSendOTP(c echo.Context) error {
	ctx := c.Request().Context()
	var req otpRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	_, v, _, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if stepLocked(v, models.KYCStepBasic) {
		return lockedStep(c)
	}

	target := ""
	switch req.Channel {
	case "phone":
		target = v.Phone
	case "email":
		target = v.Email
	default:
		return request.BadRequest(c, "ช่องทางไม่ถูกต้อง")
	}
	if target == "" {
		return request.BadRequest(c, "บันทึกข้อมูลขั้นแรกก่อนขอรหัส")
	}

	if last, err := s.kyc.LatestOTP(ctx, v.UserID, req.Channel); err == nil && last != nil &&
		time.Since(last.CreatedAt) < time.Minute {
		return request.Error(c, http.StatusTooManyRequests, "รอสักครู่ก่อนขอรหัสใหม่")
	}

	code, err := newOTPCode()
	if err != nil {
		return request.Internal(c, "สร้างรหัสไม่สำเร็จ")
	}
	otp := &models.OTPChallenge{
		UserID: v.UserID, Channel: req.Channel, Target: target,
		CodeHash: otpHash(v.UserID, code), ExpiresAt: time.Now().UTC().Add(domain.OTPLifetime),
	}
	if err := s.kyc.CreateOTP(ctx, otp); err != nil {
		return request.Internal(c, "สร้างรหัสไม่สำเร็จ")
	}

	text := "รหัสยืนยัน ROVE: " + code + " (ใช้ได้ 10 นาที)"
	if req.Channel == "phone" {
		err = s.sms.Send(ctx, target, text)
	} else {
		err = s.email.Send(ctx, target, "รหัสยืนยันอีเมล ROVE", "<p>"+text+"</p>")
	}
	if err != nil {
		logger.L().WithError(err).WithField("channel", req.Channel).Error("send otp")
		return request.Internal(c, "ส่งรหัสไม่สำเร็จ")
	}

	out := otpSentDTO{Channel: req.Channel, ExpiresAt: otp.ExpiresAt.Format(time.RFC3339)}
	if !s.cfg.IsProduction() {
		out.DevCode = code
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleVerificationCheckOTP(c echo.Context) error {
	ctx := c.Request().Context()
	var req otpRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	_, v, _, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if stepLocked(v, models.KYCStepBasic) {
		return lockedStep(c)
	}

	otp, err := s.kyc.LatestOTP(ctx, v.UserID, req.Channel)
	if err != nil || otp == nil {
		return request.BadRequest(c, "ขอรหัสใหม่อีกครั้ง")
	}
	target := v.Phone
	if req.Channel == "email" {
		target = v.Email
	}
	now := time.Now().UTC()
	if otp.ConsumedAt != nil || now.After(otp.ExpiresAt) || otp.Target != target || otp.Attempts >= domain.OTPAttempts {
		return request.BadRequest(c, "รหัสหมดอายุแล้ว ขอรหัสใหม่อีกครั้ง")
	}
	otp.Attempts++
	if otp.CodeHash != otpHash(v.UserID, strings.TrimSpace(req.Code)) {
		_ = s.kyc.SaveOTP(ctx, otp)
		return request.BadRequest(c, "รหัสไม่ถูกต้อง")
	}
	otp.ConsumedAt = &now
	if err := s.kyc.SaveOTP(ctx, otp); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}

	if req.Channel == "phone" {
		v.PhoneVerifiedAt = &now
	} else {
		v.EmailVerifiedAt = &now
	}
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return s.respondVerification(c, http.StatusOK)
}

type verificationIdentityRequest struct {
	IDNumber string `json:"id_number"`
}

func (s *Server) handleVerificationIdentity(c echo.Context) error {
	ctx := c.Request().Context()
	var req verificationIdentityRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	_, v, _, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if stepLocked(v, models.KYCStepIdentity) {
		return lockedStep(c)
	}

	number := domain.Digits(req.IDNumber)
	if !domain.ValidThaiID(number) {
		if v.LegalType == models.LegalJuristic {
			return request.BadRequest(c, "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง")
		}
		return request.BadRequest(c, "เลขบัตรประชาชนไม่ถูกต้อง")
	}
	box, err := s.kycBox()
	if err != nil {
		return request.Error(c, http.StatusServiceUnavailable, "ยังไม่เปิดระบบยืนยันตัวตน")
	}
	hash := box.Hash(v.LegalType + ":" + number)
	taken, err := s.kyc.IDHashTaken(ctx, hash, v.UserID)
	if err != nil {
		return request.Internal(c, "ตรวจเลขไม่สำเร็จ")
	}
	if taken {
		// One person, one creator account (F11 กันโกง).
		return request.Error(c, http.StatusConflict, "เลขนี้ถูกใช้ยืนยันตัวตนกับบัญชีอื่นแล้ว")
	}
	sealed, err := box.Seal(number)
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	v.IDNumberSealed, v.IDNumberHash, v.IDNumberLast4 = sealed, &hash, domain.Last4(number)
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return s.respondVerification(c, http.StatusOK)
}

const maxKYCImageBytes = 8 << 20

func (s *Server) handleVerificationDocuments(c echo.Context) error {
	ctx := c.Request().Context()
	_, v, _, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if stepLocked(v, models.KYCStepDocuments) {
		return lockedStep(c)
	}

	uploaded := false
	for field, target := range map[string]*string{"id_card": &v.IDCardKey, "selfie": &v.SelfieKey} {
		file, err := c.FormFile(field)
		if err != nil {
			continue
		}
		contentType := file.Header.Get("Content-Type")
		ext, ok := photoContentTypes[contentType]
		if !ok {
			return request.BadRequest(c, "รองรับเฉพาะรูป JPG, PNG หรือ WEBP")
		}
		if file.Size > maxKYCImageBytes {
			return request.BadRequest(c, "รูปใหญ่เกิน 8 MB")
		}
		src, err := file.Open()
		if err != nil {
			return request.BadRequest(c, "อ่านรูปไม่ได้")
		}
		key := fmt.Sprintf("verification/%s/%s-%s%s", v.UserID, field, uuid.NewString(), ext)
		err = s.storage.Put(ctx, s.kycBucket(), key, src, contentType)
		_ = src.Close()
		if err != nil {
			return request.Internal(c, "อัปโหลดรูปไม่สำเร็จ")
		}
		// The old picture of somebody's ID card has no reason to stay around.
		if *target != "" {
			_ = s.storage.Delete(ctx, s.kycBucket(), *target)
		}
		*target = key
		uploaded = true
	}
	if !uploaded {
		return request.BadRequest(c, "แนบรูปบัตร (id_card) หรือเซลฟี่คู่บัตร (selfie)")
	}
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return s.respondVerification(c, http.StatusOK)
}

type verificationAccountRequest struct {
	Kind          string `json:"kind"`
	BankCode      string `json:"bank_code"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
}

func (s *Server) handleVerificationAccount(c echo.Context) error {
	ctx := c.Request().Context()
	var req verificationAccountRequest
	if err := c.Bind(&req); err != nil {
		return request.BadRequest(c, "อ่านคำขอไม่ได้")
	}
	_, v, current, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if stepLocked(v, models.KYCStepAccount) {
		return lockedStep(c)
	}

	number := domain.Digits(req.AccountNumber)
	switch req.Kind {
	case models.AccountBank:
		if strings.TrimSpace(req.BankCode) == "" {
			return request.BadRequest(c, "เลือกธนาคาร")
		}
		if len(number) < 10 || len(number) > 15 {
			return request.BadRequest(c, "เลขบัญชีไม่ถูกต้อง")
		}
	case models.AccountPromptPay:
		if len(number) != 10 && len(number) != 13 {
			return request.BadRequest(c, "พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลักหรือเลขบัตร 13 หลัก")
		}
		req.BankCode = ""
	default:
		return request.BadRequest(c, "ประเภทบัญชีไม่ถูกต้อง")
	}
	name := strings.Join(strings.Fields(req.AccountName), " ")
	if name == "" {
		return request.BadRequest(c, "กรอกชื่อบัญชี")
	}

	box, err := s.kycBox()
	if err != nil {
		return request.Error(c, http.StatusServiceUnavailable, "ยังไม่เปิดระบบยืนยันตัวตน")
	}
	sealed, err := box.Seal(number)
	if err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	account := &models.PayoutAccount{
		UserID: v.UserID, Kind: req.Kind, BankCode: req.BankCode,
		NumberSealed: sealed, NumberHash: box.Hash(req.Kind + ":" + number), NumberLast4: domain.Last4(number),
		AccountName: name, Status: models.AccountPending,
	}
	if current != nil && current.NumberHash == account.NumberHash && current.AccountName == name &&
		current.BankCode == account.BankCode && current.Status != models.AccountRejected {
		return s.respondVerification(c, http.StatusOK)
	}
	if err := s.kyc.ReplaceAccount(ctx, account); err != nil {
		return request.Internal(c, "บันทึกไม่สำเร็จ")
	}
	return s.respondVerification(c, http.StatusOK)
}

func (s *Server) handleVerificationSubmit(c echo.Context) error {
	ctx := c.Request().Context()
	_, v, account, err := s.loadVerification(c)
	if err != nil {
		return request.Internal(c, "โหลดข้อมูลยืนยันตัวตนไม่สำเร็จ")
	}
	if v.Status != models.KYCDraft && v.Status != models.KYCRejected {
		return request.Error(c, http.StatusConflict, "ส่งตรวจไปแล้ว")
	}
	steps := stepsOf(v, account)
	if !steps.Basic || !steps.Identity || !steps.Documents || !steps.Account {
		return request.BadRequest(c, "กรอกให้ครบทั้ง 4 ขั้นก่อนส่งตรวจ")
	}
	// Checked again here, not only when the number was typed: two people can
	// hold drafts with the same number, and only the first to submit keeps it.
	taken, err := s.kyc.IDHashTaken(ctx, *v.IDNumberHash, v.UserID)
	if err != nil {
		return request.Internal(c, "ตรวจเลขไม่สำเร็จ")
	}
	if taken {
		return request.Error(c, http.StatusConflict, "เลขนี้ถูกใช้ยืนยันตัวตนกับบัญชีอื่นแล้ว")
	}
	now := time.Now().UTC()
	v.Status, v.SubmittedAt = models.KYCSubmitted, &now
	v.RejectedSteps, v.RejectReason = nil, ""
	if err := s.kyc.Save(ctx, v); err != nil {
		return request.Internal(c, "ส่งตรวจไม่สำเร็จ")
	}
	return s.respondVerification(c, http.StatusOK)
}
