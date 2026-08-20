// Package events is the realtime backbone: Redis pub/sub in, SSE out.
// Phase 1 deliberately avoids WebSockets — clients only read (DEV_SPEC §16).
package events

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
)

// Event types published on channel "trip:{tripId}".
const (
	TypeTripUpdated     = "trip.updated"
	TypeMemberJoined    = "member.joined"
	TypeMemberRemoved   = "member.removed"
	TypeWishlistChanged = "wishlist.changed"
	TypePlanReady       = "plan.ready"
	TypePlanUpdated     = "plan.updated"
	TypeItemUpdated     = "item.updated"
	TypeCommentCreated  = "comment.created"
	TypeAIProgress      = "ai.progress"
	TypeExpenseCreated  = "expense.created"
	TypeExpenseUpdated  = "expense.updated"
	TypePrepUpdated     = "prep.updated"
	TypeBookingUpdated  = "booking.updated"
	TypeExportReady     = "export.ready"
)

type Event struct {
	Type       string    `json:"type"`
	TargetType string    `json:"target_type"`
	TargetID   string    `json:"target_id"`
	ActorID    string    `json:"actor_id"`
	TS         time.Time `json:"ts"`
	// Meta carries the few extra fields a client needs to react without an
	// extra fetch — the AI progress step, an export URL.
	Meta map[string]any `json:"meta,omitempty"`
}

// Hub is injected into every service that mutates trip data. Rule from
// DEV_SPEC §6.2: every mutation writes an activity_log AND publishes here.
type Hub interface {
	Publish(ctx context.Context, tripID string, e Event) error
	// Subscribe returns a channel of events and a cancel func. The caller MUST
	// call cancel or the Redis subscription leaks.
	Subscribe(ctx context.Context, tripID string) (<-chan Event, func(), error)
}

// Channel is the Redis pub/sub channel for one trip.
func Channel(tripID string) string { return "trip:" + tripID }

type hub struct{ rdb *redis.Client }

func New(rdb *redis.Client) Hub { return &hub{rdb: rdb} }

var Module = fx.Module("services.events", fx.Provide(New))

// Publish is fire-and-forget from the caller's perspective: a mutation that
// succeeded must not be reported as failed because the fan-out hiccuped, so
// handlers log the error rather than returning it.
func (h *hub) Publish(ctx context.Context, tripID string, e Event) error {
	if e.TS.IsZero() {
		e.TS = time.Now().UTC()
	}
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return h.rdb.Publish(ctx, Channel(tripID), payload).Err()
}

// subscribeBuffer absorbs a burst (a plan persist emits one event per item)
// without blocking the Redis reader goroutine.
const subscribeBuffer = 32

func (h *hub) Subscribe(ctx context.Context, tripID string) (<-chan Event, func(), error) {
	sub := h.rdb.Subscribe(ctx, Channel(tripID))
	if _, err := sub.Receive(ctx); err != nil {
		_ = sub.Close()
		return nil, nil, err
	}

	out := make(chan Event, subscribeBuffer)
	done := make(chan struct{})

	go func() {
		defer close(out)
		ch := sub.Channel()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				var e Event
				if err := json.Unmarshal([]byte(msg.Payload), &e); err != nil {
					// A malformed frame must never take the stream down.
					continue
				}
				select {
				case out <- e:
				default:
					// A client too slow to keep up drops events rather than
					// stalling every other subscriber on this connection.
				}
			}
		}
	}()

	cancel := func() {
		close(done)
		_ = sub.Close()
	}
	return out, cancel, nil
}
