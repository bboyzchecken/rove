// Package cache is the thin Redis helper every service shares: get-or-fetch
// with a TTL, JSON in and out. Distance, weather, FX and POI lookups all go
// through it — they are the calls that cost money (DEV_SPEC §2.2).
package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
)

type Cache struct{ rdb *redis.Client }

func New(rdb *redis.Client) *Cache { return &Cache{rdb: rdb} }

var Module = fx.Module("services.cache", fx.Provide(New))

// GetJSON reads and decodes a key. Returns false when the key is missing or
// undecodable — a corrupt cache entry is a miss, never an error.
func (c *Cache) GetJSON(ctx context.Context, key string, dst any) bool {
	raw, err := c.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(raw, dst) == nil
}

func (c *Cache) SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, key, raw, ttl).Err()
}

func (c *Cache) Delete(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	return c.rdb.Del(ctx, keys...).Err()
}

// Fetch is the pattern every caller wants: return the cached value, or call
// fetch once and cache what it returns. A fetch error is returned as-is and
// nothing is cached, so the next request retries.
func Fetch[T any](ctx context.Context, c *Cache, key string, ttl time.Duration, fetch func(context.Context) (T, error)) (T, error) {
	var cached T
	if c != nil && c.GetJSON(ctx, key, &cached) {
		return cached, nil
	}

	fresh, err := fetch(ctx)
	if err != nil {
		var zero T
		return zero, err
	}
	if c != nil {
		// A cache write failure must not fail the request that already has the
		// value in hand.
		_ = c.SetJSON(ctx, key, fresh, ttl)
	}
	return fresh, nil
}

// Incr bumps a counter and sets its TTL on first use — the primitive behind
// rate limiting and the AI daily cost cap.
func (c *Cache) Incr(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	n, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if n == 1 {
		_ = c.rdb.Expire(ctx, key, ttl).Err()
	}
	return n, nil
}

// TTL exposes the remaining lifetime, used to tell a rate-limited caller when
// to try again.
func (c *Cache) TTL(ctx context.Context, key string) (time.Duration, error) {
	return c.rdb.TTL(ctx, key).Result()
}
