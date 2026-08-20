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

	uberfx "go.uber.org/fx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/cache"
)

// Quote is a rate plus when it was taken. Every response that shows converted
// money carries the timestamp, because the UI must say "อัตราโดยประมาณ ณ ..."
// rather than implying a live rate (DEV_SPEC §6.2, W16.4).
type Quote struct {
	Pair      string    `json:"pair"`
	Rate      float64   `json:"rate"`
	FetchedAt time.Time `json:"fetched_at"`
}

type Service interface {
	// Rate returns how many units of `to` one unit of `from` buys.
	Rate(ctx context.Context, from, to string) (float64, error)
	// Quote is Rate plus the as-of timestamp the UI has to display.
	Quote(ctx context.Context, from, to string) (Quote, error)
}

// TTL is 24h: a budget must not silently change between two refreshes of the
// same page.
const TTL = 24 * time.Hour

type service struct {
	cfg   core.Config
	db    *gorm.DB
	cache *cache.Cache
	http  *http.Client
}

func New(cfg core.Config, db *gorm.DB, c *cache.Cache) Service {
	return &service{
		cfg:   cfg,
		db:    db,
		cache: c,
		http:  &http.Client{Timeout: 10 * time.Second},
	}
}

var Module = uberfx.Module("services.fx", uberfx.Provide(New))

func (s *service) Rate(ctx context.Context, from, to string) (float64, error) {
	q, err := s.Quote(ctx, from, to)
	if err != nil {
		return 0, err
	}
	return q.Rate, nil
}

// Quote walks three layers before touching the network: Redis, the fx_cache
// table (which survives a Redis flush), then the provider.
func (s *service) Quote(ctx context.Context, from, to string) (Quote, error) {
	from, to = strings.ToUpper(from), strings.ToUpper(to)
	if from == to {
		return Quote{Pair: from + "_" + to, Rate: 1, FetchedAt: time.Now().UTC()}, nil
	}
	pair := from + "_" + to

	var cached Quote
	if s.cache != nil && s.cache.GetJSON(ctx, "fx:"+pair, &cached) && cached.Rate > 0 {
		return cached, nil
	}

	if row, ok := s.fromDB(ctx, pair); ok {
		s.warm(ctx, row)
		return row, nil
	}

	rate, err := s.fetch(ctx, from, to)
	if err != nil {
		// A stale rate beats no rate: the page still renders, labelled with its
		// real (old) timestamp, instead of showing a broken budget.
		if row, ok := s.fromDBStale(ctx, pair); ok {
			return row, nil
		}
		return Quote{}, err
	}

	q := Quote{Pair: pair, Rate: rate, FetchedAt: time.Now().UTC()}
	s.persist(ctx, q)
	s.warm(ctx, q)
	return q, nil
}

func (s *service) fromDB(ctx context.Context, pair string) (Quote, bool) {
	var row models.FXCache
	err := s.db.WithContext(ctx).Where("currency_pair = ?", pair).First(&row).Error
	if err != nil || time.Since(row.FetchedAt) > TTL {
		return Quote{}, false
	}
	return Quote{Pair: pair, Rate: row.Rate, FetchedAt: row.FetchedAt}, true
}

func (s *service) fromDBStale(ctx context.Context, pair string) (Quote, bool) {
	var row models.FXCache
	if err := s.db.WithContext(ctx).Where("currency_pair = ?", pair).First(&row).Error; err != nil {
		return Quote{}, false
	}
	return Quote{Pair: pair, Rate: row.Rate, FetchedAt: row.FetchedAt}, true
}

func (s *service) persist(ctx context.Context, q Quote) {
	row := models.FXCache{CurrencyPair: q.Pair, Rate: q.Rate, FetchedAt: q.FetchedAt}
	_ = s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "currency_pair"}},
		DoUpdates: clause.AssignmentColumns([]string{"rate", "fetched_at"}),
	}).Create(&row).Error
}

func (s *service) warm(ctx context.Context, q Quote) {
	if s.cache == nil {
		return
	}
	remaining := TTL - time.Since(q.FetchedAt)
	if remaining <= 0 {
		return
	}
	_ = s.cache.SetJSON(ctx, "fx:"+q.Pair, q, remaining)
}

// fetch calls the configured provider. The default URL shape is the free
// exchangerate.host / open.er-api.com style: {"rates":{"THB":0.23}}.
func (s *service) fetch(ctx context.Context, from, to string) (float64, error) {
	base := s.cfg.FX.ApiURL
	if base == "" {
		return 0, fmt.Errorf("fx: FX_API_URL is not configured")
	}

	url := strings.NewReplacer("{from}", from, "{to}", to).Replace(base)
	if !strings.Contains(base, "{from}") {
		url = fmt.Sprintf("%s?base=%s&symbols=%s", strings.TrimRight(base, "?&"), from, to)
	}
	if s.cfg.FX.ApiKey != "" {
		sep := "?"
		if strings.Contains(url, "?") {
			sep = "&"
		}
		url += sep + "access_key=" + s.cfg.FX.ApiKey
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	res, err := s.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("fx: provider returned %d", res.StatusCode)
	}

	var payload struct {
		Rates  map[string]float64 `json:"rates"`
		Result float64            `json:"result"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return 0, err
	}

	if rate, ok := payload.Rates[to]; ok && rate > 0 {
		return rate, nil
	}
	if payload.Result > 0 {
		return payload.Result, nil
	}
	return 0, fmt.Errorf("fx: no rate for %s in the provider response", to)
}
