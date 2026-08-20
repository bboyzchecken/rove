package api

import (
	"encoding/json"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// Server-Sent Events (A2.5).
//
// SSE rather than WebSockets on purpose: clients only ever read this channel —
// every write goes through a normal request — so half of a duplex protocol
// would be unused complexity (§16).
func (s *Server) registerEventRoutes(g *echo.Group) {
	g.GET("/:tripId/events", s.handleTripEvents, s.TripRoleMiddleware(models.TripRoleViewer))
}

func (s *Server) handleTripEvents(c echo.Context) error {
	ctx := c.Request().Context()
	tripID := request.TripID(c)

	stream, cancel, err := s.hub.Subscribe(ctx, tripID)
	if err != nil {
		return request.Internal(c, "เปิดสตรีมไม่สำเร็จ")
	}
	defer cancel()

	res := c.Response()
	setSSEHeaders(res)

	// An empty frame up front tells the browser the stream is live, which stops
	// EventSource from sitting in `CONNECTING` until the first real event.
	_, _ = res.Write([]byte(": connected\n\n"))
	res.Flush()

	// Proxies drop a connection that says nothing for a minute.
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil

		case <-heartbeat.C:
			_, _ = res.Write([]byte(": ping\n\n"))
			res.Flush()

		case event, ok := <-stream:
			if !ok {
				return nil
			}
			writeSSE(res, event)
		}
	}
}

func setSSEHeaders(res *echo.Response) {
	h := res.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	// Nginx buffers responses by default, which would hold every frame until
	// the stream closed — exactly the opposite of the point.
	h.Set("X-Accel-Buffering", "no")
	res.WriteHeader(200)
}

func writeSSE(res *echo.Response, payload any) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	_, _ = res.Write([]byte("data: "))
	_, _ = res.Write(raw)
	_, _ = res.Write([]byte("\n\n"))
	res.Flush()
}
