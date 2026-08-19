package logger

import (
	"time"

	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"
)

// RequestLogger logs one structured line per request.
// Health probes are skipped so they do not drown the log.
func RequestLogger() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			path := c.Request().URL.Path
			if path == "/healthz" || path == "/readyz" {
				return next(c)
			}

			start := time.Now()
			err := next(c)
			if err != nil {
				c.Error(err)
			}

			fields := logrus.Fields{
				"method":      c.Request().Method,
				"path":        path,
				"status":      c.Response().Status,
				"duration_ms": time.Since(start).Milliseconds(),
				"request_id":  c.Response().Header().Get(echo.HeaderXRequestID),
				"ip":          c.RealIP(),
			}
			if uid, ok := c.Get("user_id").(string); ok && uid != "" {
				fields["user_id"] = uid
			}

			entry := L().WithFields(fields)
			switch {
			case c.Response().Status >= 500:
				entry.Error("request")
			case c.Response().Status >= 400:
				entry.Warn("request")
			default:
				entry.Info("request")
			}
			return nil
		}
	}
}
