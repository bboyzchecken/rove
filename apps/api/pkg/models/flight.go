package models

import (
	"context"
	"time"
)

// Flight directions.
const (
	FlightDirectionOut    = "out"
	FlightDirectionReturn = "return"
)

// TripFlight anchors the itinerary: day 1 cannot start before the plane lands
// and the last day cannot run past check-in (AI buildFrame, A4.3).
type TripFlight struct {
	Base
	TripID     string     `gorm:"type:char(36);not null;index" json:"trip_id"`
	Direction  string     `gorm:"type:varchar(10);not null" json:"direction"`
	Airline    string     `gorm:"type:varchar(80)" json:"airline"`
	FlightNo   string     `gorm:"type:varchar(20)" json:"flight_no"`
	DepAirport string     `gorm:"type:varchar(10)" json:"dep_airport"`
	ArrAirport string     `gorm:"type:varchar(10)" json:"arr_airport"`
	DepAt      *time.Time `json:"dep_at"`
	ArrAt      *time.Time `json:"arr_at"`
	RawText    string     `gorm:"type:text" json:"raw_text"`
}

func (TripFlight) TableName() string { return "trip_flights" }

type FlightStore interface {
	ListByTrip(ctx context.Context, tripID string) ([]TripFlight, error)
	ReplaceAll(ctx context.Context, tripID string, flights []TripFlight) error
	Delete(ctx context.Context, tripID, id string) error
}
