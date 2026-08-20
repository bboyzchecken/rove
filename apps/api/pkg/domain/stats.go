package domain

import "time"

// Stats power the Home dashboard (M17). They are computed from trips the user
// belongs to, not from a counter column, so they cannot drift out of sync.

// TripStat is one trip, flattened for the aggregate.
type TripStat struct {
	ID        string
	Country   string
	Status    string
	StartDate *time.Time
	EndDate   *time.Time
}

type UserStats struct {
	TotalTrips    int      `json:"total_trips"`
	TotalDays     int      `json:"total_days"`
	Countries     []string `json:"countries"`
	TripsThisYear int      `json:"trips_this_year"`
	TotalSpendTHB float64  `json:"total_spend_thb"`
}

// ComputeStats counts only trips that actually happened — a draft nobody went
// on is not a country visited. `now` is a parameter so the test does not depend
// on today's date.
func ComputeStats(trips []TripStat, totalSpendTHB float64, now time.Time) UserStats {
	s := UserStats{Countries: []string{}, TotalSpendTHB: Round2(totalSpendTHB)}

	seenCountry := map[string]bool{}
	for _, t := range trips {
		if t.Status != "done" {
			continue
		}
		s.TotalTrips++

		if t.StartDate != nil && t.EndDate != nil {
			days := int(t.EndDate.Sub(*t.StartDate).Hours()/24) + 1
			if days > 0 {
				s.TotalDays += days
			}
		}
		if t.Country != "" && !seenCountry[t.Country] {
			seenCountry[t.Country] = true
			s.Countries = append(s.Countries, t.Country)
		}
		if t.StartDate != nil && t.StartDate.Year() == now.Year() {
			s.TripsThisYear++
		}
	}

	return s
}

// DaysUntil is the "อีก 12 วัน" badge on the calendar strip. It is negative for
// a trip already under way, which the UI renders differently.
func DaysUntil(start *time.Time, now time.Time) int {
	if start == nil {
		return 0
	}
	return int(truncate(*start).Sub(truncate(now)).Hours() / 24)
}
