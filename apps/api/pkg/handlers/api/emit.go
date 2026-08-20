package api

import (
	"context"
	"encoding/json"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/bboyzchecken/rove/apps/api/pkg/handlers/api/request"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/events"
)

// Every mutation writes an activity_log AND publishes an SSE event
// (DEV_SPEC §6.2). Both are best-effort: a successful write must not be
// reported as a failure because the feed or the fan-out hiccuped.

type emitOpts struct {
	Action     string
	EventType  string
	TargetType string
	TargetID   string
	Meta       map[string]any
}

// emit is the one call every mutating handler makes after it succeeds.
func (s *Server) emit(c echo.Context, tripID string, o emitOpts) {
	ctx := context.WithoutCancel(c.Request().Context())
	actorID := request.UserID(c)

	if o.Action != "" {
		log := &models.ActivityLog{
			TripID:     tripID,
			UserID:     actorID,
			Action:     o.Action,
			TargetType: o.TargetType,
			TargetID:   o.TargetID,
		}
		if len(o.Meta) > 0 {
			if raw, err := json.Marshal(o.Meta); err == nil {
				log.Meta = datatypes.JSON(raw)
			}
		}
		if err := s.activities.Log(ctx, log); err != nil {
			logger.L().WithError(err).Warn("activity log write failed")
		}
	}

	if o.EventType != "" {
		err := s.hub.Publish(ctx, tripID, events.Event{
			Type:       o.EventType,
			TargetType: o.TargetType,
			TargetID:   o.TargetID,
			ActorID:    actorID,
			Meta:       o.Meta,
		})
		if err != nil {
			logger.L().WithError(err).Warn("sse publish failed")
		}
	}
}

// jsonMarshal is the one encoder the SSE writer uses; kept here so the stream
// and the activity log stay on the same encoding path.
func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

// jsonStrings decodes a JSON array column into a slice, returning [] rather
// than nil so responses never carry a null where the client types an array.
func jsonStrings(raw datatypes.JSON) []string {
	out := []string{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		return []string{}
	}
	return out
}
