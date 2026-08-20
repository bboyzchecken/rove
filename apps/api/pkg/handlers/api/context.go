package api

import (
	"context"
	"time"

	"github.com/labstack/echo/v4"
)

func contextWithTimeout(c echo.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request().Context(), d)
}

// timeoutContext is for work that must outlive the request that started it —
// recording an affiliate click while the user is already being redirected.
func timeoutContext(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}
