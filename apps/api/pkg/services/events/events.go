// Package events is the realtime backbone: Redis pub/sub in, SSE out.
// Phase 1 deliberately avoids WebSockets — clients only read (DEV_SPEC §16).
package events

import (
	"context"
	"time"
)

// Event types published on channel "trip:{tripId}".
const (
	TypeTripUpdated     = "trip.updated"
	TypeMemberJoined    = "member.joined"
	TypeWishlistChanged = "wishlist.changed"
	TypePlanReady       = "plan.ready"
	TypePlanUpdated     = "plan.updated"
	TypeItemUpdated     = "item.updated"
	TypeCommentCreated  = "comment.created"
	TypeAIProgress      = "ai.progress"
)

type Event struct {
	Type       string    `json:"type"`
	TargetType string    `json:"target_type"`
	TargetID   string    `json:"target_id"`
	ActorID    string    `json:"actor_id"`
	TS         time.Time `json:"ts"`
}

// Hub is injected into every service that mutates trip data. Rule from
// DEV_SPEC §6.2: every mutation writes an activity_log AND publishes here.
type Hub interface {
	Publish(ctx context.Context, tripID string, e Event) error
	Subscribe(ctx context.Context, tripID string) (<-chan Event, func(), error)
}

// TODO(A2.5): implement over redis.Client Pub/Sub, plus a 20s heartbeat in the
// SSE handler so proxies do not drop idle connections.
