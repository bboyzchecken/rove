package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/hashutil"
)

// Auth is OAuth-first: LINE for Thai users, Google as the fallback. The
// email+password path exists only so an admin can get in without a social
// account, and it is disabled outside development unless the account is
// explicitly an admin (DEV_SPEC §5.1).

// registerAuthRoutes registers the auth endpoints.
//
//	POST /auth/oauth/line     {code, redirect_uri} -> {token, user}
//	POST /auth/oauth/google   {code, redirect_uri} -> {token, user}
//	POST /auth/login          email+password (dev/admin only)
//	GET  /auth/me             [jwt]
//	POST /auth/refresh        [jwt]
func (s *Server) registerAuthRoutes(g *echo.Group) {
	auth := g.Group("/auth")

	// Auth endpoints are the cheapest thing to brute-force, so they carry their
	// own tight limit on top of the global one.
	limited := s.RateLimit(RateLimitConfig{Key: "auth", Limit: 20, Window: time.Minute})

	auth.POST("/oauth/line", s.handleOAuthLine, limited)
	auth.POST("/oauth/google", s.handleOAuthGoogle, limited)
	auth.POST("/login", s.handleLogin, limited)
	auth.GET("/me", s.handleMe, s.JwtMiddleware)
	auth.POST("/refresh", s.handleRefresh, s.JwtMiddleware)
}

type oauthRequest struct {
	Code        string `json:"code" validate:"required"`
	RedirectURI string `json:"redirect_uri" validate:"required,url"`
}

type authResponse struct {
	Token string            `json:"token"`
	User  models.PublicUser `json:"user"`
	// IsNew tells the web app to send the user through onboarding (character
	// picker first) instead of straight to their trips.
	IsNew bool `json:"is_new"`
}

// oauthProfile is the common shape both providers are normalised into.
type oauthProfile struct {
	Provider    string
	UID         string
	DisplayName string
	AvatarURL   string
	Email       string
}

func (s *Server) handleOAuthLine(c echo.Context) error {
	var req oauthRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if s.cfg.Line.LoginChannelID == "" || s.cfg.Line.LoginChannelSecret == "" {
		return request.Error(c, http.StatusServiceUnavailable, "ยังไม่ได้ตั้งค่า LINE Login")
	}

	ctx, cancel := contextWithTimeout(c, 10*time.Second)
	defer cancel()

	profile, err := s.exchangeLine(ctx, req)
	if err != nil {
		return request.Unauthorized(c, "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ")
	}
	return s.completeOAuth(c, profile)
}

func (s *Server) handleOAuthGoogle(c echo.Context) error {
	var req oauthRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}
	if s.cfg.Google.OAuthClientID == "" || s.cfg.Google.OAuthClientSecret == "" {
		return request.Error(c, http.StatusServiceUnavailable, "ยังไม่ได้ตั้งค่า Google Login")
	}

	ctx, cancel := contextWithTimeout(c, 10*time.Second)
	defer cancel()

	profile, err := s.exchangeGoogle(ctx, req)
	if err != nil {
		return request.Unauthorized(c, "เข้าสู่ระบบด้วย Google ไม่สำเร็จ")
	}
	return s.completeOAuth(c, profile)
}

// completeOAuth finds or creates the user, then issues the JWT. Matching is on
// (provider, provider_uid) first and email second, so signing in with Google
// after using LINE with the same address links to one account rather than
// silently creating a duplicate.
func (s *Server) completeOAuth(c echo.Context, p *oauthProfile) error {
	ctx := c.Request().Context()

	user, err := s.users.GetByProvider(ctx, p.Provider, p.UID)
	switch {
	case err == nil:
		// Keep the display name and photo fresh on every sign-in.
		user.DisplayName = firstNonEmpty(p.DisplayName, user.DisplayName)
		if p.AvatarURL != "" {
			user.AvatarURL = p.AvatarURL
		}
		if err := s.users.Update(ctx, user); err != nil {
			return request.Internal(c, "บันทึกข้อมูลผู้ใช้ไม่สำเร็จ")
		}
		return s.issue(c, user, false)

	case err != gorm.ErrRecordNotFound:
		return request.Internal(c, "อ่านข้อมูลผู้ใช้ไม่สำเร็จ")
	}

	if p.Email != "" {
		if existing, err := s.users.GetByEmail(ctx, p.Email); err == nil {
			existing.Provider = p.Provider
			existing.ProviderUID = p.UID
			if p.AvatarURL != "" {
				existing.AvatarURL = p.AvatarURL
			}
			if err := s.users.Update(ctx, existing); err != nil {
				return request.Internal(c, "ผูกบัญชีไม่สำเร็จ")
			}
			return s.issue(c, existing, false)
		}
	}

	user = &models.User{
		DisplayName:  firstNonEmpty(p.DisplayName, "นักเดินทาง"),
		AvatarURL:    p.AvatarURL,
		Provider:     p.Provider,
		ProviderUID:  p.UID,
		Role:         models.RoleUser,
		Status:       models.UserStatusActive,
		Locale:       "th",
		HomeCurrency: "THB",
	}
	if p.Email != "" {
		email := p.Email
		user.Email = &email
		// ADMIN_EMAILS is how the first admin exists at all; there is no
		// bootstrap UI and no self-service escalation.
		for _, admin := range s.cfg.AdminEmails {
			if strings.EqualFold(admin, email) {
				user.Role = models.RoleAdmin
				break
			}
		}
	}
	if err := s.users.Create(ctx, user); err != nil {
		return request.Internal(c, "สร้างบัญชีไม่สำเร็จ")
	}
	return s.issue(c, user, true)
}

func (s *Server) issue(c echo.Context, u *models.User, isNew bool) error {
	if u.Status != models.UserStatusActive {
		return request.Forbidden(c, "บัญชีนี้ถูกปิดใช้งาน")
	}
	token, err := s.IssueToken(u)
	if err != nil {
		return request.Internal(c, "ออก token ไม่สำเร็จ")
	}
	return request.OK(c, authResponse{Token: token, User: u.Public(), IsNew: isNew})
}

// exchangeLine swaps the authorization code for a LINE profile.
func (s *Server) exchangeLine(ctx context.Context, req oauthRequest) (*oauthProfile, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {req.Code},
		"redirect_uri":  {req.RedirectURI},
		"client_id":     {s.cfg.Line.LoginChannelID},
		"client_secret": {s.cfg.Line.LoginChannelSecret},
	}

	var token struct {
		AccessToken string `json:"access_token"`
	}
	if err := postForm(ctx, "https://api.line.me/oauth2/v2.1/token", form, &token); err != nil {
		return nil, err
	}
	if token.AccessToken == "" {
		return nil, fmt.Errorf("auth: LINE returned no access token")
	}

	var profile struct {
		UserID      string `json:"userId"`
		DisplayName string `json:"displayName"`
		PictureURL  string `json:"pictureUrl"`
	}
	if err := getJSON(ctx, "https://api.line.me/v2/profile", token.AccessToken, &profile); err != nil {
		return nil, err
	}
	if profile.UserID == "" {
		return nil, fmt.Errorf("auth: LINE profile has no user id")
	}

	return &oauthProfile{
		Provider:    models.ProviderLine,
		UID:         profile.UserID,
		DisplayName: profile.DisplayName,
		AvatarURL:   profile.PictureURL,
	}, nil
}

func (s *Server) exchangeGoogle(ctx context.Context, req oauthRequest) (*oauthProfile, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {req.Code},
		"redirect_uri":  {req.RedirectURI},
		"client_id":     {s.cfg.Google.OAuthClientID},
		"client_secret": {s.cfg.Google.OAuthClientSecret},
	}

	var token struct {
		AccessToken string `json:"access_token"`
	}
	if err := postForm(ctx, "https://oauth2.googleapis.com/token", form, &token); err != nil {
		return nil, err
	}
	if token.AccessToken == "" {
		return nil, fmt.Errorf("auth: Google returned no access token")
	}

	var profile struct {
		Sub           string `json:"sub"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	err := getJSON(ctx, "https://openidconnect.googleapis.com/v1/userinfo", token.AccessToken, &profile)
	if err != nil {
		return nil, err
	}
	if profile.Sub == "" {
		return nil, fmt.Errorf("auth: Google profile has no subject")
	}

	p := &oauthProfile{
		Provider:    models.ProviderGoogle,
		UID:         profile.Sub,
		DisplayName: profile.Name,
		AvatarURL:   profile.Picture,
	}
	// An unverified address must not be able to claim an existing account by
	// matching on email.
	if profile.EmailVerified {
		p.Email = strings.ToLower(profile.Email)
	}
	return p, nil
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

// handleLogin is the escape hatch for admins and local development. It is never
// offered in the UI.
func (s *Server) handleLogin(c echo.Context) error {
	var req loginRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	user, err := s.users.GetByEmail(c.Request().Context(), strings.ToLower(req.Email))
	if err != nil || user.Password == "" {
		// One message for both cases: a different error for "no such user"
		// turns this endpoint into an account-enumeration oracle.
		return request.Unauthorized(c, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
	}
	if !hashutil.ComparePassword(user.Password, req.Password) {
		return request.Unauthorized(c, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
	}
	if s.cfg.IsProduction() && user.Role != models.RoleAdmin {
		return request.Forbidden(c, "บัญชีนี้ต้องเข้าสู่ระบบผ่าน LINE หรือ Google")
	}
	return s.issue(c, user, false)
}

func (s *Server) handleMe(c echo.Context) error {
	user, err := s.users.GetByID(c.Request().Context(), request.UserID(c))
	if err != nil {
		return request.Unauthorized(c, "ไม่พบผู้ใช้")
	}

	points, _ := s.points.Get(c.Request().Context(), user.ID)
	return request.OK(c, map[string]any{
		"id":            user.ID,
		"display_name":  user.DisplayName,
		"avatar_url":    user.AvatarURL,
		"character_id":  user.CharacterID,
		"handle":        user.Handle,
		"email":         user.Email,
		"role":          user.Role,
		"locale":        user.Locale,
		"home_currency": user.HomeCurrency,
		"is_creator":    user.IsCreator,
		"points":        points,
	})
}

// handleRefresh issues a fresh 7-day token for a still-valid one, so an active
// user is never logged out mid-trip.
func (s *Server) handleRefresh(c echo.Context) error {
	user, err := s.users.GetByID(c.Request().Context(), request.UserID(c))
	if err != nil {
		return request.Unauthorized(c, "ไม่พบผู้ใช้")
	}
	return s.issue(c, user, false)
}

// --- small HTTP helpers -----------------------------------------------------

var oauthClient = &http.Client{Timeout: 10 * time.Second}

func postForm(ctx context.Context, endpoint string, form url.Values, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint,
		strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")

	res, err := oauthClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("auth: token endpoint returned %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

func getJSON(ctx context.Context, endpoint, bearer string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+bearer)

	res, err := oauthClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("auth: profile endpoint returned %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
