package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
)

// registerEventRoutes exposes the SSE stream (DEV_SPEC §5.14 / A2.5).
//
//	GET /trips/:tripId/events   [viewer]
//
// EventSource cannot set an Authorization header, so the browser authenticates
// with the httpOnly cookie the BFF set — which JwtMiddleware already accepts.
func (s *Server) registerEventRoutes(trips *echo.Group) {
	trips.GET("/:tripId/events", s.handleEvents,
		s.TripRoleMiddleware(models.TripRoleViewer))
}

// heartbeatInterval keeps proxies and load balancers from dropping an idle
// connection. 20s is the §5.14 figure.
const heartbeatInterval = 20 * time.Second

// streamMaxAge caps a single connection. EventSource reconnects on its own, and
// a bounded lifetime means a leaked subscription cannot live forever.
const streamMaxAge = 30 * time.Minute

func (s *Server) handleEvents(c echo.Context) error {
	tripID := request.TripID(c)

	res := c.Response()
	res.Header().Set(echo.HeaderContentType, "text/event-stream")
	res.Header().Set(echo.HeaderCacheControl, "no-cache")
	res.Header().Set(echo.HeaderConnection, "keep-alive")
	// Nginx and Caddy buffer by default, which would hold events until the
	// buffer fills — for a stream that is indistinguishable from being broken.
	res.Header().Set("X-Accel-Buffering", "no")
	res.WriteHeader(http.StatusOK)

	ctx := c.Request().Context()
	stream, cancel, err := s.hub.Subscribe(ctx, tripID)
	if err != nil {
		return request.Internal(c, "เชื่อมต่อ realtime ไม่สำเร็จ")
	}
	defer cancel()

	// Tell the client how long to wait before reconnecting, and prove the
	// stream is live before the first real event arrives.
	fmt.Fprintf(res, "retry: 3000\n\n")
	fmt.Fprintf(res, ": connected\n\n")
	res.Flush()

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()
	deadline := time.NewTimer(streamMaxAge)
	defer deadline.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil

		case <-deadline.C:
			// A clean close; the browser reconnects and picks up from there.
			return nil

		case <-heartbeat.C:
			fmt.Fprintf(res, ": ping\n\n")
			res.Flush()

		case event, ok := <-stream:
			if !ok {
				return nil
			}
			payload, err := jsonMarshal(event)
			if err != nil {
				continue
			}
			// The event type goes on its own line so a client can addEventListener
			// per type, while onmessage still receives everything.
			fmt.Fprintf(res, "event: %s\ndata: %s\n\n", event.Type, payload)
			res.Flush()
		}
	}
}
