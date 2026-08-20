package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Claims is the JWT payload. HS256, 7-day lifetime (DEV_SPEC §2.2).
type Claims struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

const TokenTTL = 7 * 24 * time.Hour

// IssueToken mints a signed token for a freshly authenticated user.
func (s *Server) IssueToken(u *models.User) (string, error) {
	claims := Claims{
		UserID: u.ID,
		Role:   u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JwtSecret))
}

func (s *Server) parseToken(raw string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.JwtSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// bearer reads the token from the Authorization header, falling back to the
// httpOnly cookie the Next.js BFF sets.
func bearer(c echo.Context, cookieName string) string {
	if h := c.Request().Header.Get(echo.HeaderAuthorization); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if ck, err := c.Cookie(cookieName); err == nil {
		return ck.Value
	}
	return ""
}

// JwtMiddleware rejects anonymous requests.
func (s *Server) JwtMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		raw := bearer(c, s.cookieName)
		if raw == "" {
			return request.Unauthorized(c, "missing token")
		}
		claims, err := s.parseToken(raw)
		if err != nil {
			return request.Unauthorized(c, "invalid or expired token")
		}
		c.Set(request.CtxUserID, claims.UserID)
		c.Set(request.CtxUserRole, claims.Role)
		return next(c)
	}
}

// OptionalJwt enriches public routes with user context when a token is present,
// but never rejects the request.
func (s *Server) OptionalJwt(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if raw := bearer(c, s.cookieName); raw != "" {
			if claims, err := s.parseToken(raw); err == nil {
				c.Set(request.CtxUserID, claims.UserID)
				c.Set(request.CtxUserRole, claims.Role)
			}
		}
		return next(c)
	}
}

// IsAdmin guards the /admin namespace.
func (s *Server) IsAdmin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if request.UserRole(c) != models.RoleAdmin {
			return request.Forbidden(c, "admin only")
		}
		return next(c)
	}
}

// TripRoleMiddleware is the authorization backbone. MySQL has no row-level
// security, so membership is enforced here and re-checked in every store method
// via a tripID-scoped WHERE clause (DEV_SPEC §4.3).
//
// minRole is one of models.TripRoleViewer / TripRoleEditor / TripRoleOwner.
func (s *Server) TripRoleMiddleware(minRole string) echo.MiddlewareFunc {
	required, ok := models.TripRoleRank[minRole]
	if !ok {
		panic("TripRoleMiddleware: unknown role " + minRole)
	}

	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tripID := c.Param("tripId")
			if tripID == "" {
				return request.BadRequest(c, "trip id is required")
			}
			userID := request.UserID(c)
			if userID == "" {
				return request.Unauthorized(c, "missing token")
			}

			m, err := s.members.Get(c.Request().Context(), tripID, userID)
			if err != nil {
				// Do not leak whether the trip exists.
				return request.NotFound(c, "trip not found")
			}
			if models.TripRoleRank[m.Role] < required {
				return request.Forbidden(c, "insufficient trip role")
			}

			c.Set(request.CtxTripID, tripID)
			c.Set(request.CtxTripRole, m.Role)
			return next(c)
		}
	}
}

// httpErrorHandler normalises every error into {"error": "..."}.
func httpErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}
	status := http.StatusInternalServerError
	msg := "internal server error"

	var he *echo.HTTPError
	if errors.As(err, &he) {
		status = he.Code
		if m, ok := he.Message.(string); ok {
			msg = m
		}
	}
	_ = c.JSON(status, request.ErrorResponse{Error: msg})
}
