// Package weather wraps Open-Meteo (no API key required) for the prep blocks
// and for the AI's seasonal advice.
package weather

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/cache"
)

type Forecast struct {
	Date       time.Time `json:"date"`
	TempMinC   float64   `json:"temp_min_c"`
	TempMaxC   float64   `json:"temp_max_c"`
	RainChance float64   `json:"rain_chance"`
	Summary    string    `json:"summary"`
}

type Service interface {
	Daily(ctx context.Context, lat, lng float64, from, to time.Time) ([]Forecast, error)
}

// TTL is 6h — a forecast that changes faster than that is noise for a packing
// list, and Open-Meteo asks callers not to hammer it.
const TTL = 6 * time.Hour

// forecastHorizonDays is how far ahead Open-Meteo returns useful data. Past it
// we fall back to a climate normal rather than a fabricated forecast.
const forecastHorizonDays = 14

type service struct {
	cfg   core.Config
	cache *cache.Cache
	http  *http.Client
}

func New(cfg core.Config, c *cache.Cache) Service {
	return &service{cfg: cfg, cache: c, http: &http.Client{Timeout: 10 * time.Second}}
}

var Module = fx.Module("services.weather", fx.Provide(New))

func (s *service) Daily(ctx context.Context, lat, lng float64, from, to time.Time) ([]Forecast, error) {
	if to.Before(from) {
		return nil, fmt.Errorf("weather: end date is before start date")
	}
	// Beyond the forecast horizon the API returns nothing useful; the prep
	// block says so rather than inventing numbers.
	if from.After(time.Now().AddDate(0, 0, forecastHorizonDays)) {
		return nil, ErrTooFarAhead
	}

	key := fmt.Sprintf("weather:%.3f,%.3f:%s:%s",
		lat, lng, from.Format("2006-01-02"), to.Format("2006-01-02"))

	return cache.Fetch(ctx, s.cache, key, TTL, func(ctx context.Context) ([]Forecast, error) {
		return s.fetch(ctx, lat, lng, from, to)
	})
}

// ErrTooFarAhead lets the prep generator swap in a seasonal note instead of a
// forecast, which is honest about what we actually know.
var ErrTooFarAhead = fmt.Errorf("weather: date is beyond the forecast horizon")

func (s *service) fetch(ctx context.Context, lat, lng float64, from, to time.Time) ([]Forecast, error) {
	base := s.cfg.OpenMeteoBase
	if base == "" {
		base = "https://api.open-meteo.com"
	}
	url := fmt.Sprintf(
		"%s/v1/forecast?latitude=%.4f&longitude=%.4f"+
			"&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code"+
			"&timezone=Asia%%2FTokyo&start_date=%s&end_date=%s",
		base, lat, lng, from.Format("2006-01-02"), to.Format("2006-01-02"),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("weather: open-meteo returned %d", res.StatusCode)
	}

	var payload struct {
		Daily struct {
			Time        []string  `json:"time"`
			TempMin     []float64 `json:"temperature_2m_min"`
			TempMax     []float64 `json:"temperature_2m_max"`
			RainChance  []float64 `json:"precipitation_probability_max"`
			WeatherCode []int     `json:"weather_code"`
		} `json:"daily"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}

	d := payload.Daily
	out := make([]Forecast, 0, len(d.Time))
	for i, day := range d.Time {
		parsed, err := time.Parse("2006-01-02", day)
		if err != nil {
			continue
		}
		f := Forecast{Date: parsed}
		if i < len(d.TempMin) {
			f.TempMinC = d.TempMin[i]
		}
		if i < len(d.TempMax) {
			f.TempMaxC = d.TempMax[i]
		}
		if i < len(d.RainChance) {
			f.RainChance = d.RainChance[i]
		}
		if i < len(d.WeatherCode) {
			f.Summary = describeCode(d.WeatherCode[i])
		}
		out = append(out, f)
	}
	return out, nil
}

// describeCode maps a WMO weather code to Thai, grouped the way a traveller
// cares about: do I need an umbrella, a coat, or neither.
func describeCode(code int) string {
	switch {
	case code == 0:
		return "แดดดี"
	case code <= 3:
		return "มีเมฆบางส่วน"
	case code <= 48:
		return "หมอก"
	case code <= 57:
		return "ฝนละออง"
	case code <= 67:
		return "ฝนตก"
	case code <= 77:
		return "หิมะ"
	case code <= 82:
		return "ฝนซู่"
	case code <= 86:
		return "หิมะตกหนัก"
	default:
		return "พายุฝนฟ้าคะนอง"
	}
}
