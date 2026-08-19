// Package dateutil centralises date handling. Rule of thumb: the DB stores UTC,
// the itinerary editor thinks in Asia/Tokyo (DEV_SPEC §2.1).
package dateutil

import "time"

const (
	LayoutDate = "2006-01-02"
	LayoutTime = "15:04"
)

// TokyoLocation is the trip-side timezone for Phase 1 (Japan only).
var TokyoLocation = mustLoad("Asia/Tokyo")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

func ParseDate(s string) (time.Time, error) {
	return time.ParseInLocation(LayoutDate, s, time.UTC)
}

func FormatDate(t time.Time) string { return t.UTC().Format(LayoutDate) }

// DaysBetween counts inclusive days, which is how a trip length is expressed
// ("3–7 Jan" is 5 days, not 4).
func DaysBetween(start, end time.Time) int {
	if end.Before(start) {
		return 0
	}
	return int(end.Sub(start).Hours()/24) + 1
}

// EachDate yields every date of the trip in order.
func EachDate(start, end time.Time) []time.Time {
	n := DaysBetween(start, end)
	out := make([]time.Time, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, start.AddDate(0, 0, i))
	}
	return out
}
