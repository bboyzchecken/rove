// Package places wraps Google Places + Distance Matrix behind an interface so
// the AI pipeline can be tested without network calls (DEV_SPEC §6.2).
// Every response is cached in Redis — these are the most expensive calls we make.
package places

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"time"

	"github.com/redis/go-redis/v9"
	uberfx "go.uber.org/fx"

	"github.com/bboyzchecken/rove/apps/api/pkg/core"
	"github.com/bboyzchecken/rove/apps/api/pkg/logger"
)

type Place struct {
	PlaceID   string
	Name      string
	Lat, Lng  float64
	OpenHours map[string]string
	Closed    []string
}

type Route struct {
	Minutes int
	Meters  int
	Mode    string
}

// Service is what pkg/services/ai/tools.go calls for lookup_poi and distance.
type Service interface {
	Lookup(ctx context.Context, query string) ([]Place, error)
	Get(ctx context.Context, placeID string) (*Place, error)
	Distance(ctx context.Context, fromLat, fromLng, toLat, toLng float64, mode string) (*Route, error)
}

const cacheTTL = 7 * 24 * time.Hour

type service struct {
	cfg    core.Config
	redis  *redis.Client
	client *http.Client
}

func New(cfg core.Config, rdb *redis.Client) Service {
	return &service{cfg: cfg, redis: rdb, client: &http.Client{Timeout: 8 * time.Second}}
}

var Module = uberfx.Module("services.places", uberfx.Provide(New))

// Lookup returns nothing in mock mode rather than inventing places: the seeded
// POI table is the source the planner falls back to, and a fabricated Google
// result would be indistinguishable from a real one in the database.
func (s *service) Lookup(ctx context.Context, query string) ([]Place, error) {
	if s.cfg.UseMock() || s.cfg.Google.MapsServerKey == "" {
		return nil, nil
	}

	key := "places:lookup:" + query
	if cached, ok := s.cachedPlaces(ctx, key); ok {
		return cached, nil
	}

	endpoint := "https://maps.googleapis.com/maps/api/place/textsearch/json?query=" +
		url.QueryEscape(query) + "&key=" + s.cfg.Google.MapsServerKey

	var body struct {
		Status  string `json:"status"`
		Results []struct {
			PlaceID  string `json:"place_id"`
			Name     string `json:"name"`
			Geometry struct {
				Location struct {
					Lat float64 `json:"lat"`
					Lng float64 `json:"lng"`
				} `json:"location"`
			} `json:"geometry"`
		} `json:"results"`
	}
	if err := s.getJSON(ctx, endpoint, &body); err != nil {
		return nil, err
	}
	if body.Status != "OK" && body.Status != "ZERO_RESULTS" {
		return nil, fmt.Errorf("places: %s", body.Status)
	}

	out := make([]Place, 0, len(body.Results))
	for _, r := range body.Results {
		out = append(out, Place{
			PlaceID: r.PlaceID,
			Name:    r.Name,
			Lat:     r.Geometry.Location.Lat,
			Lng:     r.Geometry.Location.Lng,
		})
	}
	s.cachePlaces(ctx, key, out)
	return out, nil
}

func (s *service) Get(ctx context.Context, placeID string) (*Place, error) {
	if s.cfg.UseMock() || s.cfg.Google.MapsServerKey == "" {
		return nil, nil
	}

	key := "places:get:" + placeID
	if cached, ok := s.cachedPlaces(ctx, key); ok && len(cached) > 0 {
		return &cached[0], nil
	}

	endpoint := "https://maps.googleapis.com/maps/api/place/details/json?place_id=" +
		url.QueryEscape(placeID) +
		"&fields=place_id,name,geometry,opening_hours&key=" + s.cfg.Google.MapsServerKey

	var body struct {
		Status string `json:"status"`
		Result struct {
			PlaceID  string `json:"place_id"`
			Name     string `json:"name"`
			Geometry struct {
				Location struct {
					Lat float64 `json:"lat"`
					Lng float64 `json:"lng"`
				} `json:"location"`
			} `json:"geometry"`
			OpeningHours struct {
				WeekdayText []string `json:"weekday_text"`
			} `json:"opening_hours"`
		} `json:"result"`
	}
	if err := s.getJSON(ctx, endpoint, &body); err != nil {
		return nil, err
	}
	if body.Status != "OK" {
		return nil, fmt.Errorf("places: %s", body.Status)
	}

	place := Place{
		PlaceID:   body.Result.PlaceID,
		Name:      body.Result.Name,
		Lat:       body.Result.Geometry.Location.Lat,
		Lng:       body.Result.Geometry.Location.Lng,
		OpenHours: map[string]string{},
	}
	for _, line := range body.Result.OpeningHours.WeekdayText {
		place.OpenHours[line] = line
	}

	s.cachePlaces(ctx, key, []Place{place})
	return &place, nil
}

// Distance falls back to a straight-line estimate whenever Google is not
// available. It is deliberately pessimistic — a plan that assumes travel is
// faster than it is fails on the day, which is the failure mode that actually
// costs someone their morning.
func (s *service) Distance(ctx context.Context, fromLat, fromLng, toLat, toLng float64, mode string) (*Route, error) {
	if mode == "" {
		mode = "transit"
	}

	if s.cfg.UseMock() || s.cfg.Google.MapsServerKey == "" {
		return estimate(fromLat, fromLng, toLat, toLng, mode), nil
	}

	key := fmt.Sprintf("places:dist:%.4f,%.4f:%.4f,%.4f:%s", fromLat, fromLng, toLat, toLng, mode)
	if cached, ok := s.cachedRoute(ctx, key); ok {
		return cached, nil
	}

	endpoint := fmt.Sprintf(
		"https://maps.googleapis.com/maps/api/distancematrix/json?origins=%.6f,%.6f&destinations=%.6f,%.6f&mode=%s&key=%s",
		fromLat, fromLng, toLat, toLng, mode, s.cfg.Google.MapsServerKey,
	)

	var body struct {
		Rows []struct {
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
	if err := s.getJSON(ctx, endpoint, &body); err != nil {
		logger.L().WithError(err).Debug("places: distance fell back to an estimate")
		return estimate(fromLat, fromLng, toLat, toLng, mode), nil
	}
	if len(body.Rows) == 0 || len(body.Rows[0].Elements) == 0 || body.Rows[0].Elements[0].Status != "OK" {
		return estimate(fromLat, fromLng, toLat, toLng, mode), nil
	}

	el := body.Rows[0].Elements[0]
	route := &Route{Minutes: el.Duration.Value / 60, Meters: el.Distance.Value, Mode: mode}
	s.cacheRoute(ctx, key, route)
	return route, nil
}

// estimate uses great-circle distance and a mode-specific average speed, with
// a fixed overhead for waiting and walking to the platform.
func estimate(fromLat, fromLng, toLat, toLng float64, mode string) *Route {
	meters := haversine(fromLat, fromLng, toLat, toLng)

	kmh, overhead := 30.0, 8.0
	switch mode {
	case "walking", "walk":
		kmh, overhead = 4.5, 0
	case "driving", "car":
		kmh, overhead = 28, 3
	case "bicycling":
		kmh, overhead = 13, 2
	}

	minutes := int(math.Round(meters/1000/kmh*60 + overhead))
	if minutes < 1 {
		minutes = 1
	}
	return &Route{Minutes: minutes, Meters: int(math.Round(meters)), Mode: mode}
}

func haversine(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadius = 6371000.0
	rad := math.Pi / 180

	dLat := (lat2 - lat1) * rad
	dLng := (lng2 - lng1) * rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

/* ---------------------------------------------------------------- cache -- */

func (s *service) getJSON(ctx context.Context, endpoint string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("places: provider returned %d", res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

func (s *service) cachedPlaces(ctx context.Context, key string) ([]Place, bool) {
	if s.redis == nil {
		return nil, false
	}
	raw, err := s.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	var out []Place
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, false
	}
	return out, true
}

func (s *service) cachePlaces(ctx context.Context, key string, places []Place) {
	if s.redis == nil {
		return
	}
	if raw, err := json.Marshal(places); err == nil {
		_ = s.redis.Set(ctx, key, raw, cacheTTL).Err()
	}
}

func (s *service) cachedRoute(ctx context.Context, key string) (*Route, bool) {
	if s.redis == nil {
		return nil, false
	}
	raw, err := s.redis.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	var out Route
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, false
	}
	return &out, true
}

func (s *service) cacheRoute(ctx context.Context, key string, route *Route) {
	if s.redis == nil {
		return
	}
	if raw, err := json.Marshal(route); err == nil {
		_ = s.redis.Set(ctx, key, raw, cacheTTL).Err()
	}
}
