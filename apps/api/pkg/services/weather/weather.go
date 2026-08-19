// Package weather wraps Open-Meteo (no API key required) for the prep blocks
// and for the AI's seasonal advice.
package weather

import (
	"context"
	"time"
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

// TODO(A8.1): implement + cache per (lat,lng,date) for 6h.
