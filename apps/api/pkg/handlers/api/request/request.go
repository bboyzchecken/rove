// Package request holds the helpers every handler uses to read the Echo context
// and to write the project's standard response shapes.
package request

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/store"
)

// Context keys set by middleware. Read them only through the helpers below.
const (
	CtxUserID   = "user_id"
	CtxUserRole = "user_role"
	CtxTripID   = "trip_id"
	CtxTripRole = "trip_role"
)

// UserID returns the authenticated user id, or "" for anonymous requests that
// came through OptionalJwt.
func UserID(c echo.Context) string {
	id, _ := c.Get(CtxUserID).(string)
	return id
}

func UserRole(c echo.Context) string {
	r, _ := c.Get(CtxUserRole).(string)
	return r
}

// TripRole returns the caller's role inside the current trip: viewer/editor/owner.
func TripRole(c echo.Context) string {
	r, _ := c.Get(CtxTripRole).(string)
	return r
}

func TripID(c echo.Context) string {
	id, _ := c.Get(CtxTripID).(string)
	if id == "" {
		id = c.Param("tripId")
	}
	return id
}

// BindPagination reads ?page= and ?limit= with safe defaults.
func BindPagination(c echo.Context) store.Pagination {
	p := store.Pagination{
		Page:  atoi(c.QueryParam("page"), 1),
		Limit: atoi(c.QueryParam("limit"), store.DefaultLimit),
	}
	p.Normalize()
	return p
}

func atoi(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}

// ErrorResponse is the single error shape of the whole API (DEV_SPEC §4.1).
type ErrorResponse struct {
	Error string `json:"error"`
}

func Error(c echo.Context, status int, msg string) error {
	return c.JSON(status, ErrorResponse{Error: msg})
}

func BadRequest(c echo.Context, msg string) error   { return Error(c, http.StatusBadRequest, msg) }
func Unauthorized(c echo.Context, msg string) error { return Error(c, http.StatusUnauthorized, msg) }
func Forbidden(c echo.Context, msg string) error    { return Error(c, http.StatusForbidden, msg) }
func NotFound(c echo.Context, msg string) error     { return Error(c, http.StatusNotFound, msg) }
func Internal(c echo.Context, msg string) error {
	return Error(c, http.StatusInternalServerError, msg)
}

// BindAndValidate is the first line of nearly every handler.
func BindAndValidate(c echo.Context, dst any) error {
	if err := c.Bind(dst); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(dst); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return nil
}
