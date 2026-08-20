package models

import "time"

// Durable caches. Redis holds the hot copy; these tables survive a Redis flush
// and keep the Google/FX bill down (DEV_SPEC §4.2 "caches").

type DistanceCache struct {
	FromKey   string    `gorm:"type:varchar(80);primaryKey" json:"from_key"`
	ToKey     string    `gorm:"type:varchar(80);primaryKey" json:"to_key"`
	Mode      string    `gorm:"type:varchar(20);primaryKey" json:"mode"`
	Minutes   int       `gorm:"not null" json:"minutes"`
	Meters    int       `gorm:"not null" json:"meters"`
	FetchedAt time.Time `gorm:"not null" json:"fetched_at"`
}

func (DistanceCache) TableName() string { return "distance_cache" }

type WeatherCache struct {
	PlaceKey   string    `gorm:"type:varchar(80);primaryKey" json:"place_key"`
	Date       time.Time `gorm:"type:date;primaryKey" json:"date"`
	TempMinC   float64   `gorm:"type:decimal(5,2)" json:"temp_min_c"`
	TempMaxC   float64   `gorm:"type:decimal(5,2)" json:"temp_max_c"`
	RainChance float64   `gorm:"type:decimal(5,2)" json:"rain_chance"`
	Summary    string    `gorm:"type:varchar(120)" json:"summary"`
	FetchedAt  time.Time `gorm:"not null" json:"fetched_at"`
}

func (WeatherCache) TableName() string { return "weather_cache" }

// FXCache TTL is 24h — a budget must not silently change between two refreshes
// of the same page (DEV_SPEC §6.2).
type FXCache struct {
	CurrencyPair string    `gorm:"type:varchar(7);primaryKey" json:"currency_pair"` // "JPY_THB"
	Rate         float64   `gorm:"type:decimal(16,6);not null" json:"rate"`
	FetchedAt    time.Time `gorm:"not null" json:"fetched_at"`
}

func (FXCache) TableName() string { return "fx_cache" }
