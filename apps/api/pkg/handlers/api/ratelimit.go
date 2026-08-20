package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
)

// Rate limiting is a fixed window in Redis, keyed per user when we know who is
// calling and per IP otherwise (DEV_SPEC §6.2). A fixed window lets through up
// to 2× the limit across a boundary; for protecting an AI budget and a 2 GB box
// that is fine, and it costs one INCR instead of a sorted set per request.

type RateLimitConfig struct {
	// Key namespaces the counter so two limits never share a bucket.
	Key    string
	Limit  int
	Window time.Duration
}

func (s *Server) RateLimit(cfg RateLimitConfig) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if s.cache == nil || cfg.Limit <= 0 {
				return next(c)
			}

			subject := request.UserID(c)
			if subject == "" {
				subject = "ip:" + c.RealIP()
			}
			key := fmt.Sprintf("rl:%s:%s", cfg.Key, subject)

			n, err := s.cache.Incr(c.Request().Context(), key, cfg.Window)
			if err != nil {
				// Redis being down must not take the API down with it.
				return next(c)
			}
			if n > int64(cfg.Limit) {
				ttl, _ := s.cache.TTL(c.Request().Context(), key)
				if ttl > 0 {
					c.Response().Header().Set("Retry-After",
						fmt.Sprintf("%d", int(ttl.Seconds())))
				}
				return request.Error(c, http.StatusTooManyRequests,
					"เรียกใช้บ่อยเกินไป ลองใหม่อีกครั้งในอีกสักครู่")
			}
			return next(c)
		}
	}
}
