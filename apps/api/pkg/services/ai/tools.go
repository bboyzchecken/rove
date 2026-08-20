package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/bboyzchecken/rove/apps/api/pkg/models"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/fx"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/places"
	"github.com/bboyzchecken/rove/apps/api/pkg/services/weather"
)

// Tools are the guardrail described in DEV_SPEC §6.3: the model is not allowed
// to state an opening time, a travel duration, a temperature or an exchange
// rate that did not come from here.
//
//	lookup_poi(query, city?)      -> POI candidates from our DB (FULLTEXT)
//	get_poi(poi_id)               -> full POI incl. open_hours, closed_days
//	distance(from, to, mode)      -> minutes + metres, Redis-cached
//	weather(lat, lng, date)       -> daily forecast
//	fx(from, to)                  -> exchange rate
//
// Phase 1 resolves these facts BEFORE the completion and injects them into the
// prompt, rather than running a tool-use loop. One round trip instead of five
// keeps generation inside the job timeout and the cost cap, and the guarantee
// is identical: every fact in the prompt came from a real service.

type Tools struct {
	pois    models.POIStore
	places  places.Service
	weather weather.Service
	fx      fx.Service
}

func NewTools(p models.POIStore, pl places.Service, w weather.Service, f fx.Service) *Tools {
	return &Tools{pois: p, places: pl, weather: w, fx: f}
}

// POICandidate is the compact POI shape the prompt carries. Long prose fields
// are trimmed — the model needs identity and constraints, not marketing copy.
type POICandidate struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	NameEN      string            `json:"name_en,omitempty"`
	City        string            `json:"city,omitempty"`
	Area        string            `json:"area,omitempty"`
	Category    string            `json:"category,omitempty"`
	Tags        []string          `json:"tags,omitempty"`
	AvgVisitMin int               `json:"avg_visit_min,omitempty"`
	AvgCostJPY  float64           `json:"avg_cost_jpy,omitempty"`
	OpenHours   map[string]string `json:"open_hours,omitempty"`
	ClosedDays  []string          `json:"closed_days,omitempty"`
	Tips        string            `json:"tips,omitempty"`
}

// LookupPOI backs the lookup_poi tool.
func (t *Tools) LookupPOI(ctx context.Context, query, city string, limit int) ([]POICandidate, error) {
	rows, err := t.pois.Search(ctx, query, city, "", limit)
	if err != nil {
		return nil, err
	}
	out := make([]POICandidate, 0, len(rows))
	for i := range rows {
		out = append(out, toCandidate(&rows[i]))
	}
	return out, nil
}

// GetPOI backs the get_poi tool.
func (t *Tools) GetPOI(ctx context.Context, poiID string) (*POICandidate, error) {
	row, err := t.pois.GetByID(ctx, poiID)
	if err != nil {
		return nil, err
	}
	c := toCandidate(row)
	return &c, nil
}

// Catalogue assembles the POI shortlist for one trip: everything in the target
// cities plus anything the wishlist explicitly named. This is what the planner
// is allowed to choose from.
func (t *Tools) Catalogue(ctx context.Context, cities []string, wishTexts []string, perCity int) ([]POICandidate, error) {
	seen := map[string]bool{}
	out := []POICandidate{}

	add := func(rows []models.POI) {
		for i := range rows {
			if seen[rows[i].ID] {
				continue
			}
			seen[rows[i].ID] = true
			out = append(out, toCandidate(&rows[i]))
		}
	}

	for _, city := range cities {
		rows, err := t.pois.Search(ctx, "", city, "", perCity)
		if err != nil {
			return nil, err
		}
		add(rows)
	}

	// A wish naming a specific place must reach the prompt even when that place
	// is outside the shortlist we assembled by city.
	for _, text := range wishTexts {
		if strings.TrimSpace(text) == "" {
			continue
		}
		rows, err := t.pois.Search(ctx, text, "", "", 3)
		if err != nil {
			continue
		}
		add(rows)
	}

	return out, nil
}

// Distance backs the distance tool. It returns nil (not an error) when Maps is
// unconfigured, so the planner falls back to its own estimate and the validator
// simply skips the travel-realism rule.
func (t *Tools) Distance(ctx context.Context, fromLat, fromLng, toLat, toLng float64, mode string) *places.Route {
	route, err := t.places.Distance(ctx, fromLat, fromLng, toLat, toLng, mode)
	if err != nil {
		return nil
	}
	return route
}

// Weather backs the weather tool.
func (t *Tools) Weather(ctx context.Context, lat, lng float64, from, to time.Time) []weather.Forecast {
	f, err := t.weather.Daily(ctx, lat, lng, from, to)
	if err != nil {
		return nil
	}
	return f
}

// FX backs the fx tool.
func (t *Tools) FX(ctx context.Context, from, to string) (fx.Quote, bool) {
	q, err := t.fx.Quote(ctx, from, to)
	if err != nil {
		return fx.Quote{}, false
	}
	return q, true
}

// FactSheet is the block of tool-sourced truth prepended to the planner prompt.
type FactSheet struct {
	POIs     []POICandidate     `json:"pois"`
	Weather  []weather.Forecast `json:"weather,omitempty"`
	FXRate   *fx.Quote          `json:"fx,omitempty"`
	Warnings []string           `json:"warnings,omitempty"`
}

func (f FactSheet) JSON() string {
	raw, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func toCandidate(p *models.POI) POICandidate {
	c := POICandidate{
		ID:          p.ID,
		Name:        p.NameTH,
		NameEN:      p.NameEN,
		City:        p.City,
		Area:        p.Area,
		Category:    p.Category,
		AvgVisitMin: p.AvgVisitMin,
		Tips:        truncate(p.Tips, 200),
	}
	if c.Name == "" {
		c.Name = p.NameEN
	}
	if p.AvgCostJPY != nil {
		c.AvgCostJPY = *p.AvgCostJPY
	}
	if len(p.Tags) > 0 {
		_ = json.Unmarshal(p.Tags, &c.Tags)
	}
	if len(p.OpenHours) > 0 {
		_ = json.Unmarshal(p.OpenHours, &c.OpenHours)
	}
	if len(p.ClosedDays) > 0 {
		_ = json.Unmarshal(p.ClosedDays, &c.ClosedDays)
	}
	return c
}

// POIFactsFor converts catalogue rows into the shape domain.ValidatePlan needs.
func (t *Tools) POIFactsFor(ctx context.Context, ids []string) (map[string]poiFacts, error) {
	rows, err := t.pois.ListByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[string]poiFacts, len(rows))
	for i := range rows {
		c := toCandidate(&rows[i])
		out[rows[i].ID] = poiFacts{
			ID:         rows[i].ID,
			Name:       c.Name,
			OpenHours:  c.OpenHours,
			ClosedDays: c.ClosedDays,
			Zone:       rows[i].ZoneKey(),
			Lat:        rows[i].Lat,
			Lng:        rows[i].Lng,
		}
	}
	return out, nil
}

type poiFacts struct {
	ID         string
	Name       string
	OpenHours  map[string]string
	ClosedDays []string
	Zone       string
	Lat, Lng   *float64
}

// ResolveFromURL turns a pasted Google Maps link into a POI, creating an
// unverified catalogue row when the place is new to us (A5.3).
func (t *Tools) ResolveFromURL(ctx context.Context, raw string) (*models.POI, error) {
	placeID := extractPlaceID(raw)
	if placeID == "" {
		return nil, fmt.Errorf("ai: could not find a place id in %q", truncate(raw, 120))
	}

	if existing, err := t.pois.GetByPlaceID(ctx, placeID); err == nil {
		return existing, nil
	}

	detail, err := t.places.Get(ctx, placeID)
	if err != nil {
		return nil, err
	}

	poi := &models.POI{
		NameTH:        detail.Name,
		NameEN:        detail.Name,
		Country:       "JP",
		GooglePlaceID: detail.PlaceID,
		Source:        "google",
		IsActive:      true,
	}
	if detail.Lat != 0 || detail.Lng != 0 {
		lat, lng := detail.Lat, detail.Lng
		poi.Lat, poi.Lng = &lat, &lng
	}
	if len(detail.OpenHours) > 0 {
		if raw, err := json.Marshal(detail.OpenHours); err == nil {
			poi.OpenHours = raw
		}
	}
	if len(detail.Closed) > 0 {
		if raw, err := json.Marshal(detail.Closed); err == nil {
			poi.ClosedDays = raw
		}
	}
	if err := t.pois.Create(ctx, poi); err != nil {
		return nil, err
	}
	return poi, nil
}

// extractPlaceID pulls a place id out of the URL shapes Google hands out.
func extractPlaceID(raw string) string {
	for _, marker := range []string{"place_id=", "!1s", "query_place_id="} {
		if i := strings.Index(raw, marker); i >= 0 {
			rest := raw[i+len(marker):]
			end := strings.IndexAny(rest, "&?/!#")
			if end < 0 {
				end = len(rest)
			}
			if id := rest[:end]; strings.HasPrefix(id, "ChIJ") || strings.HasPrefix(id, "Ei") {
				return id
			}
		}
	}
	if strings.HasPrefix(raw, "ChIJ") {
		return raw
	}
	return ""
}
