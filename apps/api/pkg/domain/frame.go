package domain

import (
	"fmt"
	"sort"
	"time"
)

// The frame is the set of facts the planner is NOT allowed to move: when the
// plane lands, which nights are already paid for, which must-do has a fixed
// date. Building it in Go rather than asking the model keeps those anchors
// exact (DEV_SPEC A4.3).

// FrameFlight is one leg, already parsed.
type FrameFlight struct {
	Direction string // out | return
	Airport   string
	At        time.Time
}

// FrameAnchor is one immovable commitment on a specific day.
type FrameAnchor struct {
	DayIndex  int
	Kind      string // arrival | departure | stay | dated_must
	Title     string
	StartTime string
	EndTime   string
	POIID     string
	Note      string
}

// FrameDay is one day of the skeleton the planner fills in.
type FrameDay struct {
	Index      int           `json:"index"`
	Date       string        `json:"date"` // YYYY-MM-DD
	Anchors    []FrameAnchor `json:"anchors"`
	SuggestZon []string      `json:"suggested_zones"`
	// UsableHours is what is left after the anchors, in minutes; the planner
	// uses it to decide how much fits.
	UsableHours int `json:"usable_hours"`
}

type Frame struct {
	Days           []FrameDay `json:"days"`
	PartySize      int        `json:"party_size"`
	MaxItemsPerDay int        `json:"max_items_per_day"`
	HomeCurrency   string     `json:"home_currency"`
	DestCurrency   string     `json:"dest_currency"`
}

// FrameInput is everything BuildFrame needs, with no DB access.
type FrameInput struct {
	StartDate      time.Time
	EndDate        time.Time
	PartySize      int
	MaxItemsPerDay int
	HomeCurrency   string
	DestCurrency   string
	Flights        []FrameFlight
	// DatedMusts are wishes pinned to a date ("ดอกไม้ไฟวันที่ 12").
	DatedMusts []DatedMust
	// PrepaidStays are hotels already booked, keyed by the night they cover.
	PrepaidStays []PrepaidStay
	// ZonesByDay is an optional hint, e.g. from a cloned trip.
	ZonesByDay map[int][]string
}

type DatedMust struct {
	Date      time.Time
	Title     string
	POIID     string
	StartTime string
	EndTime   string
}

type PrepaidStay struct {
	CheckIn  time.Time
	CheckOut time.Time
	Title    string
	Note     string
}

// fullDayMinutes is the planning budget for a day with no flight in it:
// 09:00 to 21:00.
const fullDayMinutes = 12 * 60

// BuildFrame lays out one FrameDay per calendar day and attaches the anchors.
// An arrival or departure eats into that day's usable hours, which is what
// stops the planner from booking a museum an hour after a red-eye lands.
func BuildFrame(in FrameInput) (Frame, error) {
	if in.StartDate.IsZero() || in.EndDate.IsZero() {
		return Frame{}, fmt.Errorf("frame needs both a start and an end date")
	}
	if in.EndDate.Before(in.StartDate) {
		return Frame{}, fmt.Errorf("end date %s is before start date %s",
			in.EndDate.Format("2006-01-02"), in.StartDate.Format("2006-01-02"))
	}

	partySize := in.PartySize
	if partySize < 1 {
		partySize = 1
	}
	maxItems := in.MaxItemsPerDay
	if maxItems < 1 {
		maxItems = MaxNormalItems
	}

	dayCount := int(in.EndDate.Sub(in.StartDate).Hours()/24) + 1
	frame := Frame{
		Days:           make([]FrameDay, 0, dayCount),
		PartySize:      partySize,
		MaxItemsPerDay: maxItems,
		HomeCurrency:   in.HomeCurrency,
		DestCurrency:   in.DestCurrency,
	}

	for i := 0; i < dayCount; i++ {
		date := in.StartDate.AddDate(0, 0, i)
		day := FrameDay{
			Index:       i,
			Date:        date.Format("2006-01-02"),
			Anchors:     []FrameAnchor{},
			SuggestZon:  in.ZonesByDay[i],
			UsableHours: fullDayMinutes,
		}

		for _, f := range in.Flights {
			if !sameDay(f.At, date) {
				continue
			}
			kind, title := "arrival", fmt.Sprintf("ถึง %s", f.Airport)
			if f.Direction == "return" {
				kind, title = "departure", fmt.Sprintf("ออกจาก %s", f.Airport)
			}
			day.Anchors = append(day.Anchors, FrameAnchor{
				DayIndex:  i,
				Kind:      kind,
				Title:     title,
				StartTime: f.At.Format("15:04"),
				Note:      "เวลาบิน — ห้ามย้าย",
			})
			day.UsableHours = usableAfterFlight(f, date)
		}

		for _, m := range in.DatedMusts {
			if !sameDay(m.Date, date) {
				continue
			}
			day.Anchors = append(day.Anchors, FrameAnchor{
				DayIndex:  i,
				Kind:      "dated_must",
				Title:     m.Title,
				POIID:     m.POIID,
				StartTime: m.StartTime,
				EndTime:   m.EndTime,
				Note:      "ล็อกวันไว้แล้ว",
			})
		}

		for _, s := range in.PrepaidStays {
			if date.Before(truncate(s.CheckIn)) || !date.Before(truncate(s.CheckOut)) {
				continue
			}
			day.Anchors = append(day.Anchors, FrameAnchor{
				DayIndex: i,
				Kind:     "stay",
				Title:    s.Title,
				Note:     "จ่ายแล้ว — " + s.Note,
			})
		}

		sort.SliceStable(day.Anchors, func(a, b int) bool {
			return day.Anchors[a].StartTime < day.Anchors[b].StartTime
		})
		frame.Days = append(frame.Days, day)
	}

	return frame, nil
}

// usableAfterFlight leaves 2h of slack around a flight for immigration, bags
// and the train into town.
func usableAfterFlight(f FrameFlight, date time.Time) int {
	const slack = 2 * 60
	minutesIntoDay := f.At.Hour()*60 + f.At.Minute()

	if f.Direction == "return" {
		// Everything before the flight, minus slack for getting to the airport.
		remaining := minutesIntoDay - slack
		return clampMinutes(remaining)
	}
	// Arrival: whatever is left of a 21:00 evening after landing plus slack.
	remaining := 21*60 - (minutesIntoDay + slack)
	return clampMinutes(remaining)
}

func clampMinutes(m int) int {
	if m < 0 {
		return 0
	}
	if m > fullDayMinutes {
		return fullDayMinutes
	}
	return m
}

func sameDay(a, b time.Time) bool {
	return truncate(a).Equal(truncate(b))
}

func truncate(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
