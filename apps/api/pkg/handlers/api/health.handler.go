package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)

// handleHealthz is the liveness probe: the process is up. It must not touch
// MySQL or Redis, otherwise a transient DB blip restarts a healthy container.
func (s *Server) handleHealthz(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"status": "ok",
		"env":    s.cfg.Environment,
		"commit": s.cfg.Commit,
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

// handleReadyz is the readiness probe: every dependency answers. The deploy
// script (deploy/deploy.sh) waits on this before switching traffic.
func (s *Server) handleReadyz(c echo.Context) error {
	ctx, cancel := contextWithTimeout(c, 3*time.Second)
	defer cancel()

	checks := map[string]string{"mysql": "ok", "redis": "ok"}
	ready := true

	if sqlDB, err := s.db.DB(); err != nil || sqlDB.PingContext(ctx) != nil {
		checks["mysql"] = "unreachable"
		ready = false
	}
	if err := s.redis.Ping(ctx).Err(); err != nil {
		checks["redis"] = "unreachable"
		ready = false
	}

	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}
	return c.JSON(status, map[string]any{"ready": ready, "checks": checks})
}
