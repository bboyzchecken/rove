package models

import (
	"context"
	"time"
)

// Leg direction. "inter" is the leg between two destinations — the one that
// turns "Seoul and Tokyo" from an ambiguous wish into a route the plan can be
// built around.
const (
	FlightOut   = "out"
	FlightInter = "inter"
	FlightBack  = "back"
)

// How the group covers a leg. Trains, buses and ferries are legs too: without
// them a two-city route has a hole in it and the day count silently lies.
const (
	FlightModeFlight = "flight"
	FlightModeGround = "ground"
)

// TripFlight is one leg of the route (DEV_SPEC §4.3 trip_flights).
//
// Dates and times are kept apart on purpose. A group books the outbound flight
// months before it knows what time it leaves, and "ถึง 08:05" is the fact the
// first day of the plan is built on — a nullable datetime would force us to
// invent a departure time to store an arrival one. Both times are wall clock at
// their own airport, never UTC: nobody reads a boarding pass in UTC.
type TripFlight struct {
	Base
	TripID     string     `gorm:"type:char(36);not null;index" json:"trip_id"`
	Seq        int        `gorm:"not null;default:0" json:"seq"`
	Direction  string     `gorm:"type:varchar(10);not null;default:'out'" json:"direction"`
	Mode       string     `gorm:"type:varchar(10);not null;default:'flight'" json:"mode"`
	Airline    string     `gorm:"type:varchar(60)" json:"airline"`
	FlightNo   string     `gorm:"type:varchar(20)" json:"flight_no"`
	DepAirport string     `gorm:"type:varchar(4);not null" json:"dep_airport"`
	ArrAirport string     `gorm:"type:varchar(4);not null" json:"arr_airport"`
	DepDate    *time.Time `gorm:"type:date" json:"dep_date"`
	DepTime    string     `gorm:"type:varchar(5)" json:"dep_time"`
	ArrDate    *time.Time `gorm:"type:date" json:"arr_date"`
	ArrTime    string     `gorm:"type:varchar(5)" json:"arr_time"`
	// What the group pasted, kept so a mis-parse can be re-read later.
	RawText string `gorm:"type:text" json:"raw_text"`
	Note    string `gorm:"type:varchar(255)" json:"note"`
}

func (TripFlight) TableName() string { return "trip_flights" }

type FlightStore interface {
	ListByTrip(ctx context.Context, tripID string) ([]TripFlight, error)
	Get(ctx context.Context, tripID, flightID string) (*TripFlight, error)
	Create(ctx context.Context, f *TripFlight) error
	Update(ctx context.Context, f *TripFlight) error
	Delete(ctx context.Context, tripID, flightID string) error
	// ReplaceAll swaps the whole route in one transaction — what trip creation
	// and "paste the ticket again" both do.
	ReplaceAll(ctx context.Context, tripID string, flights []TripFlight) error
}
