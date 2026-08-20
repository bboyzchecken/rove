// Package events is the realtime backbone: Redis pub/sub in, SSE out.
// Phase 1 deliberately avoids WebSockets — clients only read (DEV_SPEC §16).
package events

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
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
	TypeDatesChanged    = "dates.changed"
	TypeDatesLocked     = "dates.locked"
	TypeExpenseChanged  = "expense.changed"
	TypePrepChanged     = "prep.changed"
	TypeBookingChanged  = "booking.changed"
)

type Event struct {
	Type       string    `json:"type"`
	TargetType string    `json:"target_type"`
	TargetID   string    `json:"target_id"`
	ActorID    string    `json:"actor_id"`
	TS         time.Time `json:"ts"`
	// Payload carries the changed object when the client would otherwise have
	// to refetch immediately — AI progress being the case that matters.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Hub is injected into every service that mutates trip data. Rule from
// DEV_SPEC §6.2: every mutation writes an activity_log AND publishes here.
type Hub interface {
	Publish(ctx context.Context, tripID string, e Event) error
	Subscribe(ctx context.Context, tripID string) (<-chan Event, func(), error)
}

func channel(tripID string) string { return "trip:" + tripID }

/* ------------------------------------------------------------- redis hub -- */

type redisHub struct {
	client *redis.Client
	// Local fan-out as well as Redis: a single-instance deployment should not
	// depend on a round trip through another process to see its own events.
	local *memoryHub
}

// NewHub returns the Redis-backed hub, falling back to an in-process one when
// Redis is not configured — a developer without Docker still gets working SSE.
func NewHub(client *redis.Client) Hub {
	local := newMemoryHub()
	if client == nil {
		return local
	}
	return &redisHub{client: client, local: local}
}

var Module = fx.Module("services.events", fx.Provide(NewHub))

func (h *redisHub) Publish(ctx context.Context, tripID string, e Event) error {
	if e.TS.IsZero() {
		e.TS = time.Now().UTC()
	}
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}

	// Deliver locally first so this instance's own subscribers never wait on
	// the network, then broadcast for the others.
	_ = h.local.Publish(ctx, tripID, e)
	return h.client.Publish(ctx, channel(tripID), payload).Err()
}

func (h *redisHub) Subscribe(ctx context.Context, tripID string) (<-chan Event, func(), error) {
	sub := h.client.Subscribe(ctx, channel(tripID))
	localCh, localCancel, err := h.local.Subscribe(ctx, tripID)
	if err != nil {
		_ = sub.Close()
		return nil, nil, err
	}

	out := make(chan Event, 16)
	done := make(chan struct{})

	go func() {
		defer close(out)
		redisCh := sub.Channel()

		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case msg, ok := <-redisCh:
				if !ok {
					return
				}
				var e Event
				if err := json.Unmarshal([]byte(msg.Payload), &e); err != nil {
					// A malformed frame must never take the stream down.
					logger.L().WithError(err).Warn("events: bad payload")
					continue
				}
				select {
				case out <- e:
				default: // a slow client is dropped from, not blocking, the hub
				}
			case e, ok := <-localCh:
				if !ok {
					return
				}
				select {
				case out <- e:
				default:
				}
			}
		}
	}()

	cancel := func() {
		close(done)
		localCancel()
		_ = sub.Close()
	}
	return out, cancel, nil
}

/* ------------------------------------------------------------ memory hub -- */

type memoryHub struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan Event]struct{}
}

func newMemoryHub() *memoryHub {
	return &memoryHub{subscribers: map[string]map[chan Event]struct{}{}}
}

func (h *memoryHub) Publish(_ context.Context, tripID string, e Event) error {
	if e.TS.IsZero() {
		e.TS = time.Now().UTC()
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.subscribers[tripID] {
		select {
		case ch <- e:
		default: // never block a mutation on a stalled reader
		}
	}
	return nil
}

func (h *memoryHub) Subscribe(_ context.Context, tripID string) (<-chan Event, func(), error) {
	ch := make(chan Event, 16)

	h.mu.Lock()
	if h.subscribers[tripID] == nil {
		h.subscribers[tripID] = map[chan Event]struct{}{}
	}
	h.subscribers[tripID][ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			delete(h.subscribers[tripID], ch)
			if len(h.subscribers[tripID]) == 0 {
				delete(h.subscribers, tripID)
			}
			h.mu.Unlock()
			close(ch)
		})
	}
	return ch, cancel, nil
}
