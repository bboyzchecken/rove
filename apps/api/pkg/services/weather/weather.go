// Package weather wraps Open-Meteo (no API key required) for the prep blocks
// and for the AI's seasonal advice.
package weather

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Forecast struct {
	Date       time.Time
	TempMinC   float64
	TempMaxC   float64
	RainChance float64
	Summary    string
}

type Service interface {
	Daily(ctx context.Context, lat, lng float64, from, to time.Time) ([]Forecast, error)
}

const cacheTTL = 6 * time.Hour

type service struct {
	cfg    core.Config
	redis  *redis.Client
	client *http.Client
}

func New(cfg core.Config, rdb *redis.Client) Service {
	return &service{cfg: cfg, redis: rdb, client: &http.Client{Timeout: 8 * time.Second}}
}

var Module = uberfx.Module("services.weather", uberfx.Provide(New))

func (s *service) Daily(ctx context.Context, lat, lng float64, from, to time.Time) ([]Forecast, error) {
	if to.Before(from) {
		return nil, nil
	}

	key := fmt.Sprintf("wx:%.2f:%.2f:%s:%s", lat, lng, from.Format("2006-01-02"), to.Format("2006-01-02"))
	if cached, ok := s.fromCache(ctx, key); ok {
		return cached, nil
	}

	if s.cfg.UseStubs() {
		return seasonal(lat, from, to), nil
	}

	out, err := s.fetch(ctx, lat, lng, from, to)
	if err != nil {
		// A forecast is a nice-to-have on the prep tab; failing the whole
		// screen over it would be the wrong trade.
		logger.L().WithError(err).Warn("weather: falling back to a seasonal estimate")
		return seasonal(lat, from, to), nil
	}

	s.toCache(ctx, key, out)
	return out, nil
}

func (s *service) fetch(ctx context.Context, lat, lng float64, from, to time.Time) ([]Forecast, error) {
	url := fmt.Sprintf(
		"%s/v1/forecast?latitude=%.4f&longitude=%.4f&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=%s&end_date=%s",
		s.cfg.OpenMeteoBase, lat, lng, from.Format("2006-01-02"), to.Format("2006-01-02"),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("weather: provider returned %d", res.StatusCode)
	}

	var body struct {
		Daily struct {
			Time      []string  `json:"time"`
			TempMax   []float64 `json:"temperature_2m_max"`
			TempMin   []float64 `json:"temperature_2m_min"`
			RainChance []float64 `json:"precipitation_probability_max"`
		} `json:"daily"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}

	out := make([]Forecast, 0, len(body.Daily.Time))
	for i, day := range body.Daily.Time {
		date, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		f := Forecast{Date: date}
		if i < len(body.Daily.TempMax) {
			f.TempMaxC = body.Daily.TempMax[i]
		}
		if i < len(body.Daily.TempMin) {
			f.TempMinC = body.Daily.TempMin[i]
		}
		if i < len(body.Daily.RainChance) {
			f.RainChance = body.Daily.RainChance[i]
		}
		f.Summary = Summarise(f)
		out = append(out, f)
	}
	return out, nil
}

// seasonal is the stand-in used by mock mode and by the fallback path: a rough
// northern-hemisphere curve, which for a Japan-first product is close enough
// to be useful and is clearly labelled as an estimate in the UI.
func seasonal(lat float64, from, to time.Time) []Forecast {
	out := make([]Forecast, 0)

	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		// Peak in July, trough in January.
		phase := math.Cos((float64(d.YearDay()) - 195) / 365 * 2 * math.Pi)
		mean := 16 + 12*phase
		if lat < 0 {
			mean = 16 - 12*phase // southern hemisphere runs the other way
		}

		f := Forecast{
			Date:       d,
			TempMaxC:   math.Round(mean + 5),
			TempMinC:   math.Round(mean - 4),
			RainChance: 20,
		}
		f.Summary = Summarise(f)
		out = append(out, f)
	}
	return out
}

// Summarise turns numbers into the one line the day header shows.
func Summarise(f Forecast) string {
	switch {
	case f.RainChance >= 60:
		return "ฝนตกได้ทั้งวัน พกร่ม"
	case f.TempMaxC <= 5:
		return "หนาวจัด เตรียมเสื้อกันหนาวหนา ๆ"
	case f.TempMaxC <= 15:
		return "หนาวสบาย ใส่เสื้อคลุมพอ"
	case f.TempMaxC >= 32:
		return "ร้อน พกน้ำติดตัว"
	default:
		return "อากาศกำลังดี"
	}
}

// Icon is the emoji the day card renders.
func Icon(f Forecast) string {
	switch {
	case f.RainChance >= 60:
		return "🌧️"
	case f.RainChance >= 30:
		return "⛅"
	case f.TempMaxC <= 5:
		return "❄️"
	default:
		return "☀️"
	}
}

func (s *service) fromCache(ctx context.Context, key string) ([]Forecast, bool) {
	if s.redis == nil {
		return nil, false
	}
	raw, err := s.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	var out []Forecast
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, false
	}
	return out, true
}

func (s *service) toCache(ctx context.Context, key string, out []Forecast) {
	if s.redis == nil {
		return
	}
	raw, err := json.Marshal(out)
	if err != nil {
		return
	}
	if err := s.redis.Set(ctx, key, raw, cacheTTL).Err(); err != nil {
		logger.L().WithError(err).Debug("weather: cache write failed")
	}
}
