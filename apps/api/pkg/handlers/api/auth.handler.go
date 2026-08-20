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

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/utils/str"
)

// Auth (A0.4 / A0.5 — DEV_SPEC §5.1).
//
// Sign-in is OAuth only: LINE first, because that is where these groups already
// live, and Google second. There is no password anywhere in Phase 1, which is
// also why there is no reset flow to build.
func (s *Server) registerAuthRoutes(g *echo.Group) {
	g.GET("/auth/:provider/url", s.handleAuthURL)
	g.POST("/auth/oauth/:provider", s.handleOAuthExchange)
	g.GET("/auth/me", s.handleMe, s.JwtMiddleware)
	g.POST("/auth/logout", s.handleLogout)

	// Mock mode needs a way in that does not involve a real provider console.
	// It is registered only when mocking is on, so it cannot exist in production
	// by accident.
	if s.cfg.UseMock() {
		g.POST("/auth/demo", s.handleDemoLogin)
	}
}

type authURLResponse struct {
	URL string `json:"url"`
}

// handleAuthURL hands the browser the provider's consent URL. The state is a
// random string echoed back on the callback — the BFF checks it, not us.
func (s *Server) handleAuthURL(c echo.Context) error {
	provider := c.Param("provider")
	redirect := c.QueryParam("redirect")
	if redirect == "" {
		redirect = s.cfg.WebBaseURL
	}

	callback := strings.TrimRight(s.cfg.WebBaseURL, "/") + "/api/auth/callback"
	state := str.RandomToken(24)

	switch provider {
	case models.ProviderLine:
		if s.cfg.Line.LoginChannelID == "" {
			return request.BadRequest(c, "ยังไม่ได้ตั้งค่า LINE Login")
		}
		u := "https://access.line.me/oauth2/v2.1/authorize?response_type=code" +
			"&client_id=" + url.QueryEscape(s.cfg.Line.LoginChannelID) +
			"&redirect_uri=" + url.QueryEscape(callback+"?provider=line") +
			"&state=" + url.QueryEscape(state) +
			"&scope=" + url.QueryEscape("profile openid email")
		return c.JSON(http.StatusOK, authURLResponse{URL: u})

	case models.ProviderGoogle:
		if s.cfg.Google.OAuthClientID == "" {
			return request.BadRequest(c, "ยังไม่ได้ตั้งค่า Google OAuth")
		}
		u := "https://accounts.google.com/o/oauth2/v2/auth?response_type=code" +
			"&client_id=" + url.QueryEscape(s.cfg.Google.OAuthClientID) +
			"&redirect_uri=" + url.QueryEscape(callback+"?provider=google") +
			"&state=" + url.QueryEscape(state) +
			"&scope=" + url.QueryEscape("openid email profile")
		return c.JSON(http.StatusOK, authURLResponse{URL: u})

	default:
		return request.BadRequest(c, "ไม่รองรับผู้ให้บริการนี้")
	}
}

type oauthExchangeRequest struct {
	Code        string `json:"code" validate:"required"`
	RedirectURI string `json:"redirect_uri"`
	// Optional: who invited this person, so the referral can be credited.
	ReferredBy string `json:"referred_by"`
}

type authResponse struct {
	Token string `json:"token"`
	User  meDTO  `json:"user"`
}

// handleOAuthExchange trades the provider's code for a profile, finds or creates
// the matching user, and mints our own JWT. The provider's token is never
// stored: we do not act on the user's behalf anywhere.
func (s *Server) handleOAuthExchange(c echo.Context) error {
	provider := c.Param("provider")

	var req oauthExchangeRequest
	if err := request.BindAndValidate(c, &req); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c, 15*time.Second)
	defer cancel()

	var (
		profile oauthProfile
		err     error
	)
	switch provider {
	case models.ProviderLine:
		profile, err = s.exchangeLine(ctx, req)
	case models.ProviderGoogle:
		profile, err = s.exchangeGoogle(ctx, req)
	default:
		return request.BadRequest(c, "ไม่รองรับผู้ให้บริการนี้")
	}
	if err != nil {
		return request.Unauthorized(c, "เข้าสู่ระบบไม่สำเร็จ: "+err.Error())
	}

	user, err := s.findOrCreateUser(ctx, provider, profile, req.ReferredBy)
	if err != nil {
		return request.Internal(c, "สร้างบัญชีไม่สำเร็จ")
	}

	token, err := s.IssueToken(user)
	if err != nil {
		return request.Internal(c, "ออกโทเคนไม่สำเร็จ")
	}

	balance, _ := s.points.Balance(ctx, user.ID)
	return c.JSON(http.StatusOK, authResponse{Token: token, User: toMeDTO(*user, balance)})
}

// handleDemoLogin signs in a fixed demo account. Mock mode only — the route is
// not registered otherwise.
func (s *Server) handleDemoLogin(c echo.Context) error {
	ctx, cancel := contextWithTimeout(c, 10*time.Second)
	defer cancel()

	user, err := s.findOrCreateUser(ctx, models.ProviderPassword, oauthProfile{
		ProviderUID: "demo-user",
		DisplayName: "ผู้ใช้ทดลอง",
		Email:       "demo@rove.app",
	}, "")
	if err != nil {
		return request.Internal(c, "สร้างบัญชีทดลองไม่สำเร็จ")
	}

	token, err := s.IssueToken(user)
	if err != nil {
		return request.Internal(c, "ออกโทเคนไม่สำเร็จ")
	}

	balance, _ := s.points.Balance(ctx, user.ID)
	return c.JSON(http.StatusOK, authResponse{Token: token, User: toMeDTO(*user, balance)})
}

func (s *Server) handleMe(c echo.Context) error {
	ctx, cancel := contextWithTimeout(c, 5*time.Second)
	defer cancel()

	user, err := s.users.GetByID(ctx, request.UserID(c))
	if err != nil {
		return request.Unauthorized(c, "ไม่พบผู้ใช้")
	}
	balance, _ := s.points.Balance(ctx, user.ID)
	return c.JSON(http.StatusOK, toMeDTO(*user, balance))
}

// handleLogout clears the cookie the BFF set. The JWT itself is stateless, so
// this is the whole of "signing out" — a revocation list would be a lie about
// how much control we have over an already-issued token.
func (s *Server) handleLogout(c echo.Context) error {
	c.SetCookie(&http.Cookie{
		Name:     s.cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})
	return c.NoContent(http.StatusNoContent)
}

/* ----------------------------------------------------------------- oauth -- */

type oauthProfile struct {
	ProviderUID string
	DisplayName string
	Email       string
	AvatarURL   string
}

func (s *Server) exchangeLine(ctx context.Context, req oauthExchangeRequest) (oauthProfile, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {req.Code},
		"redirect_uri":  {req.RedirectURI},
		"client_id":     {s.cfg.Line.LoginChannelID},
		"client_secret": {s.cfg.Line.LoginChannelSecret},
	}

	var token struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error_description"`
	}
	if err := postForm(ctx, "https://api.line.me/oauth2/v2.1/token", form, &token); err != nil {
		return oauthProfile{}, err
	}
	if token.AccessToken == "" {
		return oauthProfile{}, fmt.Errorf("line: %s", orDefault(token.Error, "no access token"))
	}

	var profile struct {
		UserID      string `json:"userId"`
		DisplayName string `json:"displayName"`
		PictureURL  string `json:"pictureUrl"`
	}
	if err := getJSONAuth(ctx, "https://api.line.me/v2/profile", token.AccessToken, &profile); err != nil {
		return oauthProfile{}, err
	}

	return oauthProfile{
		ProviderUID: profile.UserID,
		DisplayName: profile.DisplayName,
		AvatarURL:   profile.PictureURL,
	}, nil
}

func (s *Server) exchangeGoogle(ctx context.Context, req oauthExchangeRequest) (oauthProfile, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {req.Code},
		"redirect_uri":  {req.RedirectURI},
		"client_id":     {s.cfg.Google.OAuthClientID},
		"client_secret": {s.cfg.Google.OAuthClientSecret},
	}

	var token struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error_description"`
	}
	if err := postForm(ctx, "https://oauth2.googleapis.com/token", form, &token); err != nil {
		return oauthProfile{}, err
	}
	if token.AccessToken == "" {
		return oauthProfile{}, fmt.Errorf("google: %s", orDefault(token.Error, "no access token"))
	}

	var profile struct {
		Sub     string `json:"sub"`
		Name    string `json:"name"`
		Email   string `json:"email"`
		Picture string `json:"picture"`
	}
	if err := getJSONAuth(ctx, "https://openidconnect.googleapis.com/v1/userinfo", token.AccessToken, &profile); err != nil {
		return oauthProfile{}, err
	}

	return oauthProfile{
		ProviderUID: profile.Sub,
		DisplayName: profile.Name,
		Email:       profile.Email,
		AvatarURL:   profile.Picture,
	}, nil
}

// findOrCreateUser links by provider uid first, then by e-mail: someone who
// signed up with Google and later uses LINE with the same address is one
// person, not two.
func (s *Server) findOrCreateUser(
	ctx context.Context,
	provider string,
	profile oauthProfile,
	referredBy string,
) (*models.User, error) {
	if existing, err := s.users.GetByProvider(ctx, provider, profile.ProviderUID); err == nil {
		return existing, nil
	}

	if profile.Email != "" {
		if existing, err := s.users.GetByEmail(ctx, profile.Email); err == nil {
			existing.Provider = provider
			existing.ProviderUID = profile.ProviderUID
			if existing.AvatarURL == "" {
				existing.AvatarURL = profile.AvatarURL
			}
			if err := s.users.Update(ctx, existing); err != nil {
				return nil, err
			}
			return existing, nil
		}
	}

	user := &models.User{
		DisplayName: orDefault(profile.DisplayName, "นักเดินทาง"),
		AvatarURL:   profile.AvatarURL,
		Provider:    provider,
		ProviderUID: profile.ProviderUID,
		Role:        models.RoleUser,
		Status:      models.UserStatusActive,
		Locale:      "th",
		HomeCurrency: "THB",
	}
	if profile.Email != "" {
		user.Email = &profile.Email
	}
	if referredBy != "" {
		user.ReferredBy = &referredBy
	}

	// The first account to sign in on a fresh install is the admin: someone has
	// to be able to open the admin screens, and a hardcoded seed user would be
	// a credential in the repository.
	if n, err := s.users.Count(ctx); err == nil && n == 0 {
		user.Role = models.RoleAdmin
	}
	for _, email := range s.cfg.AdminEmails {
		if profile.Email != "" && strings.EqualFold(email, profile.Email) {
			user.Role = models.RoleAdmin
		}
	}

	if err := s.users.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

/* ------------------------------------------------------------------ http -- */

var oauthClient = &http.Client{Timeout: 10 * time.Second}

func postForm(ctx context.Context, endpoint string, form url.Values, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")

	res, err := oauthClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	return json.NewDecoder(res.Body).Decode(dst)
}

func getJSONAuth(ctx context.Context, endpoint, token string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)

	res, err := oauthClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("provider returned %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

func orDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
