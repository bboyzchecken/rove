// Package places wraps Google Places + Distance Matrix behind an interface so
// the AI pipeline can be tested without network calls (DEV_SPEC §6.2).
// Every response is cached in Redis — these are the most expensive calls we make.
package places

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/cache"
)

type Place struct {
	PlaceID   string            `json:"place_id"`
	Name      string            `json:"name"`
	Address   string            `json:"address"`
	Lat       float64           `json:"lat"`
	Lng       float64           `json:"lng"`
	OpenHours map[string]string `json:"open_hours"`
	Closed    []string          `json:"closed"`
}

type Route struct {
	Minutes int    `json:"minutes"`
	Meters  int    `json:"meters"`
	Mode    string `json:"mode"`
}

// Service is what pkg/services/ai/tools.go calls for lookup_poi and distance.
type Service interface {
	Lookup(ctx context.Context, query string) ([]Place, error)
	Get(ctx context.Context, placeID string) (*Place, error)
	Distance(ctx context.Context, fromLat, fromLng, toLat, toLng float64, mode string) (*Route, error)
	// Configured reports whether a Maps key is present, so callers can degrade
	// to catalogue-only behaviour instead of erroring on every request.
	Configured() bool
}

// Cache TTLs. Place details barely change; routes change with timetables but
// not within a planning session.
const (
	PlaceTTL = 7 * 24 * time.Hour
	RouteTTL = 24 * time.Hour
)

// ErrNotConfigured is returned when no Maps key is set. Callers treat it as
// "no enrichment available", not as a failure.
var ErrNotConfigured = fmt.Errorf("places: GOOGLE_MAPS_SERVER_KEY is not configured")

type service struct {
	key   string
	cache *cache.Cache
	http  *http.Client
}

func New(cfg core.Config, c *cache.Cache) Service {
	return &service{
		key:   cfg.Google.MapsServerKey,
		cache: c,
		http:  &http.Client{Timeout: 10 * time.Second},
	}
}

var Module = fx.Module("services.places", fx.Provide(New))

func (s *service) Configured() bool { return s.key != "" }

func (s *service) Lookup(ctx context.Context, query string) ([]Place, error) {
	if !s.Configured() {
		return nil, ErrNotConfigured
	}
	key := "places:lookup:" + strings.ToLower(strings.TrimSpace(query))

	return cache.Fetch(ctx, s.cache, key, PlaceTTL, func(ctx context.Context) ([]Place, error) {
		endpoint := "https://maps.googleapis.com/maps/api/place/textsearch/json?query=" +
			url.QueryEscape(query) + "&language=th&key=" + s.key

		var payload struct {
			Status  string `json:"status"`
			Results []struct {
				PlaceID  string `json:"place_id"`
				Name     string `json:"name"`
				Address  string `json:"formatted_address"`
				Geometry struct {
					Location struct{ Lat, Lng float64 } `json:"location"`
				} `json:"geometry"`
			} `json:"results"`
		}
		if err := s.getJSON(ctx, endpoint, &payload); err != nil {
			return nil, err
		}
		if payload.Status != "OK" && payload.Status != "ZERO_RESULTS" {
			return nil, fmt.Errorf("places: text search returned %s", payload.Status)
		}

		out := make([]Place, 0, len(payload.Results))
		for _, r := range payload.Results {
			out = append(out, Place{
				PlaceID: r.PlaceID,
				Name:    r.Name,
				Address: r.Address,
				Lat:     r.Geometry.Location.Lat,
				Lng:     r.Geometry.Location.Lng,
			})
		}
		return out, nil
	})
}

func (s *service) Get(ctx context.Context, placeID string) (*Place, error) {
	if !s.Configured() {
		return nil, ErrNotConfigured
	}

	place, err := cache.Fetch(ctx, s.cache, "places:detail:"+placeID, PlaceTTL,
		func(ctx context.Context) (Place, error) {
			endpoint := "https://maps.googleapis.com/maps/api/place/details/json?place_id=" +
				url.QueryEscape(placeID) +
				"&fields=place_id,name,formatted_address,geometry,opening_hours&language=th&key=" + s.key

			var payload struct {
				Status string `json:"status"`
				Result struct {
					PlaceID  string `json:"place_id"`
					Name     string `json:"name"`
					Address  string `json:"formatted_address"`
					Geometry struct {
						Location struct{ Lat, Lng float64 } `json:"location"`
					} `json:"geometry"`
					OpeningHours struct {
						Periods []struct {
							Open struct {
								Day  int
								Time string
							} `json:"open"`
							Close struct {
								Day  int
								Time string
							} `json:"close"`
						} `json:"periods"`
					} `json:"opening_hours"`
				} `json:"result"`
			}
			if err := s.getJSON(ctx, endpoint, &payload); err != nil {
				return Place{}, err
			}
			if payload.Status != "OK" {
				return Place{}, fmt.Errorf("places: details returned %s", payload.Status)
			}

			r := payload.Result
			p := Place{
				PlaceID:   r.PlaceID,
				Name:      r.Name,
				Address:   r.Address,
				Lat:       r.Geometry.Location.Lat,
				Lng:       r.Geometry.Location.Lng,
				OpenHours: map[string]string{},
			}
			open := map[int]bool{}
			for _, period := range r.OpeningHours.Periods {
				day := weekdayName(period.Open.Day)
				if day == "" {
					continue
				}
				open[period.Open.Day] = true
				p.OpenHours[day] = formatHHMM(period.Open.Time) + "-" + formatHHMM(period.Close.Time)
			}
			// Google lists only the days a place opens, so a missing day IS a
			// closed day — but only when we got any periods at all.
			if len(r.OpeningHours.Periods) > 0 {
				for d := 0; d < 7; d++ {
					if !open[d] {
						p.Closed = append(p.Closed, weekdayName(d))
					}
				}
			}
			return p, nil
		})
	if err != nil {
		return nil, err
	}
	return &place, nil
}

func (s *service) Distance(ctx context.Context, fromLat, fromLng, toLat, toLng float64, mode string) (*Route, error) {
	if mode == "" {
		mode = "transit"
	}
	if !s.Configured() {
		return nil, ErrNotConfigured
	}

	key := fmt.Sprintf("places:route:%.4f,%.4f:%.4f,%.4f:%s", fromLat, fromLng, toLat, toLng, mode)

	route, err := cache.Fetch(ctx, s.cache, key, RouteTTL, func(ctx context.Context) (Route, error) {
		endpoint := fmt.Sprintf(
			"https://maps.googleapis.com/maps/api/distancematrix/json"+
				"?origins=%.6f,%.6f&destinations=%.6f,%.6f&mode=%s&language=th&key=%s",
			fromLat, fromLng, toLat, toLng, mode, s.key,
		)

		var payload struct {
			Status string `json:"status"`
			Rows   []struct {
				Elements []struct {
					Status   string `json:"status"`
					Duration struct {
						Value int `json:"value"`
					} `json:"duration"`
					Distance struct {
						Value int `json:"value"`
					} `json:"distance"`
				} `json:"elements"`
			} `json:"rows"`
		}
		if err := s.getJSON(ctx, endpoint, &payload); err != nil {
			return Route{}, err
		}
		if payload.Status != "OK" || len(payload.Rows) == 0 || len(payload.Rows[0].Elements) == 0 {
			return Route{}, fmt.Errorf("places: distance matrix returned %s", payload.Status)
		}
		el := payload.Rows[0].Elements[0]
		if el.Status != "OK" {
			return Route{}, fmt.Errorf("places: no route (%s)", el.Status)
		}
		return Route{
			Minutes: el.Duration.Value / 60,
			Meters:  el.Distance.Value,
			Mode:    mode,
		}, nil
	})
	if err != nil {
		return nil, err
	}
	return &route, nil
}

func (s *service) getJSON(ctx context.Context, endpoint string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("places: http %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

var weekdays = []string{"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}

func weekdayName(d int) string {
	if d < 0 || d >= len(weekdays) {
		return ""
	}
	return weekdays[d]
}

// formatHHMM turns Google's "0930" into "09:30".
func formatHHMM(s string) string {
	if len(s) != 4 {
		return s
	}
	return s[:2] + ":" + s[2:]
}
