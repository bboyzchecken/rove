// Package fx converts JPY costs into the group's home currency.
// (Named after foreign exchange — unrelated to the Uber FX DI container.)
package fx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Service interface {
	// Rate returns how many units of `to` one unit of `from` buys.
	Rate(ctx context.Context, from, to string) (float64, error)
}

// cacheTTL is 12 hours: a trip snapshots its rate into trips.fx_rate anyway, so
// the live rate only has to be fresh enough for a new estimate — not for a
// trading desk.
const cacheTTL = 12 * time.Hour

// fallbackRates keep the product working when the provider is down or unset.
// They are deliberately conservative and are always labelled "โดยประมาณ" in
// the UI, which is true of the live rates too.
var fallbackRates = map[string]float64{
	"JPY>THB": 0.235,
	"THB>JPY": 4.26,
	"KRW>THB": 0.026,
	"TWD>THB": 1.09,
	"USD>THB": 35.5,
	"EUR>THB": 38.2,
	"HKD>THB": 4.55,
	"VND>THB": 0.0014,
}

type service struct {
	cfg    core.Config
	redis  *redis.Client
	client *http.Client
}

func New(cfg core.Config, rdb *redis.Client) Service {
	return &service{
		cfg:   cfg,
		redis: rdb,
		// A budget screen must not hang on a currency API.
		client: &http.Client{Timeout: 6 * time.Second},
	}
}

var Module = uberfx.Module("services.fx", uberfx.Provide(New))

func (s *service) Rate(ctx context.Context, from, to string) (float64, error) {
	from, to = strings.ToUpper(from), strings.ToUpper(to)
	if from == to {
		return 1, nil
	}
	key := from + ">" + to

	if cached, ok := s.fromCache(ctx, key); ok {
		return cached, nil
	}

	// Mock mode and a missing provider behave identically on purpose: the same
	// deterministic number, so a UAT budget is reproducible.
	if s.cfg.UseStubs() || s.cfg.FX.ApiURL == "" {
		rate, ok := fallbackRates[key]
		if !ok {
			return 0, fmt.Errorf("fx: no fallback rate for %s", key)
		}
		return rate, nil
	}

	rate, err := s.fetch(ctx, from, to)
	if err != nil {
		if fallback, ok := fallbackRates[key]; ok {
			logger.L().WithError(err).Warnf("fx: falling back to a stored rate for %s", key)
			return fallback, nil
		}
		return 0, err
	}

	s.toCache(ctx, key, rate)
	return rate, nil
}

func (s *service) fromCache(ctx context.Context, key string) (float64, bool) {
	if s.redis == nil {
		return 0, false
	}
	var rate float64
	if err := s.redis.Get(ctx, "fx:"+key).Scan(&rate); err != nil || rate <= 0 {
		return 0, false
	}
	return rate, true
}

func (s *service) toCache(ctx context.Context, key string, rate float64) {
	if s.redis == nil {
		return
	}
	if err := s.redis.Set(ctx, "fx:"+key, rate, cacheTTL).Err(); err != nil {
		logger.L().WithError(err).Debug("fx: cache write failed")
	}
}

// fetch expects the shape exchangerate-style APIs return:
// {"rates": {"THB": 0.235}}.
func (s *service) fetch(ctx context.Context, from, to string) (float64, error) {
	url := fmt.Sprintf("%s?base=%s&symbols=%s", strings.TrimRight(s.cfg.FX.ApiURL, "/"), from, to)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	if s.cfg.FX.ApiKey != "" {
		req.Header.Set("apikey", s.cfg.FX.ApiKey)
	}

	res, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("fx: provider returned %d", res.StatusCode)
	}

	var body struct {
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return 0, err
	}

	rate, ok := body.Rates[to]
	if !ok || rate <= 0 {
		return 0, fmt.Errorf("fx: provider has no rate for %s", to)
	}
	return rate, nil
}
