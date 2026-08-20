package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
)

// Rate limiting (A0.7).
//
// Two buckets, because two things need protecting for different reasons: the
// API in general against a runaway client, and the AI endpoints specifically
// against a bill. The counter lives in Redis so it survives a restart and is
// shared if a second instance ever appears; without Redis the limiter steps
// aside rather than failing closed — a dev machine should not need a container
// to log in.
const (
	generalLimit  = 240 // requests
	generalWindow = time.Minute

	aiLimit  = 12 // drafts
	aiWindow = time.Hour
)

func (s *Server) RateLimit() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if s.redis == nil {
				return next(c)
			}
			// Health checks are what a load balancer hits every few seconds.
			if path := c.Path(); path == "/healthz" || path == "/readyz" {
				return next(c)
			}

			limit, window, bucket := generalLimit, generalWindow, "gen"
			if strings.Contains(c.Path(), "/ai/") {
				limit, window, bucket = aiLimit, aiWindow, "ai"
			}

			key := "rl:" + bucket + ":" + rateKey(c)
			ctx := c.Request().Context()

			count, err := s.redis.Incr(ctx, key).Result()
			if err != nil {
				return next(c) // never fail a request because the limiter is down
			}
			if count == 1 {
				_ = s.redis.Expire(ctx, key, window).Err()
			}

			c.Response().Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
			c.Response().Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, limit-int(count))))

			if int(count) > limit {
				ttl, _ := s.redis.TTL(ctx, key).Result()
				c.Response().Header().Set("Retry-After", strconv.Itoa(int(ttl.Seconds())))
				return request.Error(c, http.StatusTooManyRequests, "ยิงคำขอถี่เกินไป — รอสักครู่แล้วลองใหม่")
			}
			return next(c)
		}
	}
}

// rateKey buckets by user when we know who they are, and by IP when we do not:
// four people behind one office NAT should not share a quota once signed in.
func rateKey(c echo.Context) string {
	if id := request.UserID(c); id != "" {
		return "u:" + id
	}
	return "ip:" + c.RealIP()
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
