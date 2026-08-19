// Package places wraps Google Places + Distance Matrix behind an interface so
// the AI pipeline can be tested without network calls (DEV_SPEC §6.2).
// Every response is cached in Redis — these are the most expensive calls we make.
package places

import "context"

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

// TODO(A4.2): implement against the Google Maps API with a Redis-cached decorator.
