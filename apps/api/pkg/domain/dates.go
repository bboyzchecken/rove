package domain

import (
	"fmt"
	"sort"
	"time"
)

// Date coordination (DEV_SPEC M2.5 — A2.6).
//
// This file is the server-side twin of `apps/web/lib/data/domain.ts`. The two
// must agree to the day: mock mode computes windows in the browser, live mode
// receives them from here, and a UAT tester must not be able to tell which one
// produced the screen. `apps/web/lib/__tests__/domain.test.ts` pins the same
// numbers as dates_test.go on purpose.

// Availability marks.
const (
	MarkFree  = "free"
	MarkMaybe = "maybe"
)

// AvailabilityInput is one member's answer for one day, flattened.
type AvailabilityInput struct {
	UserID string
	Date   time.Time
	Mark   string
}

// DateWindow is a run of consecutive days a group shares.
type DateWindow struct {
	ID             string   `json:"id"`
	StartDate      string   `json:"start_date"`
	EndDate        string   `json:"end_date"`
	Days           int      `json:"days"`
	MemberIDs      []string `json:"member_ids"`
	MaybeMemberIDs []string `json:"maybe_member_ids"`
	Everyone       bool     `json:"everyone"`
	Score          int      `json:"score"`
	Reason         string   `json:"reason"`
}

// WindowOptions tunes the search. Zero values mean the defaults the product
// ships with: at least two days, at most six suggestions.
type WindowOptions struct {
	MinDays int
	Limit   int
}

const isoDate = "2006-01-02"

// Day returns the date with the clock stripped — availability is a calendar
// concept, and a stray timestamp turns "4 Dec" into two different days.
func Day(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func FormatDate(t time.Time) string { return Day(t).Format(isoDate) }

func ParseDate(s string) (time.Time, error) {
	t, err := time.Parse(isoDate, s)
	if err != nil {
		return time.Time{}, err
	}
	return Day(t), nil
}

// DaysBetween counts inclusively: 4 Dec → 8 Dec is five days, not four.
func DaysBetween(start, end time.Time) int {
	return int(Day(end).Sub(Day(start)).Hours()/24) + 1
}

func isWeekend(t time.Time) bool {
	d := t.Weekday()
	return d == time.Saturday || d == time.Sunday
}

type dayMarks struct {
	free  map[string]bool
	maybe map[string]bool
}

func indexEntries(entries []AvailabilityInput) map[string]*dayMarks {
	byDate := make(map[string]*dayMarks)
	for _, e := range entries {
		key := FormatDate(e.Date)
		marks, ok := byDate[key]
		if !ok {
			marks = &dayMarks{free: map[string]bool{}, maybe: map[string]bool{}}
			byDate[key] = marks
		}
		switch e.Mark {
		case MarkFree:
			marks.free[e.UserID] = true
		case MarkMaybe:
			marks.maybe[e.UserID] = true
		}
	}
	return byDate
}

func intersect(a, b map[string]bool) map[string]bool {
	out := make(map[string]bool, len(a))
	for k := range a {
		if b[k] {
			out[k] = true
		}
	}
	return out
}

func keys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func windowScore(days, freeCount, total int, start time.Time) int {
	coverage := 0.0
	if total > 0 {
		coverage = float64(freeCount) / float64(total)
	}

	// A 4–6 day window is the sweet spot for the trips this app plans; shorter
	// is cramped, longer starts costing leave days nobody has.
	lengthFit := 0.7
	switch {
	case days >= 4 && days <= 6:
		lengthFit = 1
	case days == 3 || days == 7:
		lengthFit = 0.82
	case days < 3:
		lengthFit = 0.5
	}

	weekend := 0
	for i := 0; i < days; i++ {
		if isWeekend(start.AddDate(0, 0, i)) {
			weekend++
		}
	}
	if weekend > 2 {
		weekend = 2
	}
	weekendFit := float64(weekend) / 2

	return int(roundHalfUp((coverage*0.6 + lengthFit*0.28 + weekendFit*0.12) * 100))
}

func windowReason(days int, free, maybe []string, total int, start time.Time) string {
	parts := make([]string, 0, 4)
	if len(free) == total {
		parts = append(parts, "ทุกคนว่างครบ")
	} else {
		parts = append(parts, fmt.Sprintf("ว่าง %d/%d คน", len(free), total))
	}
	if len(maybe) > 0 {
		parts = append(parts, fmt.Sprintf("%d คนไปได้แต่ไม่สะดวก", len(maybe)))
	}

	weekend := 0
	for i := 0; i < days; i++ {
		if isWeekend(start.AddDate(0, 0, i)) {
			weekend++
		}
	}
	if weekend >= 2 {
		parts = append(parts, "คร่อมเสาร์-อาทิตย์ ลางานน้อยลง")
	}
	if days >= 4 && days <= 6 {
		parts = append(parts, fmt.Sprintf("%d วันกำลังพอดีกับทริปต่างประเทศ", days))
	}
	return joinWithDot(parts)
}

func joinWithDot(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " · "
		}
		out += p
	}
	return out
}

func roundHalfUp(f float64) float64 {
	if f < 0 {
		return -roundHalfUp(-f)
	}
	return float64(int64(f + 0.5))
}

// ComputeWindows returns every maximal run of consecutive days that at least
// two members share, best first.
//
// "Maximal" is the interesting part: 4–5, 4–6 and 4–7 Dec are all real
// overlaps, but suggesting them alongside 4–8 Dec would bury the answer in its
// own prefixes. Only the longest run per member-set survives.
func ComputeWindows(entries []AvailabilityInput, memberIDs []string, opts WindowOptions) []DateWindow {
	minDays := opts.MinDays
	if minDays <= 0 {
		minDays = 2
	}
	limit := opts.Limit
	if limit <= 0 {
		limit = 6
	}

	total := len(memberIDs)
	if total == 0 || len(entries) == 0 {
		return []DateWindow{}
	}

	byDate := indexEntries(entries)
	dates := make([]string, 0, len(byDate))
	for k := range byDate {
		dates = append(dates, k)
	}
	sort.Strings(dates)

	first, err := ParseDate(dates[0])
	if err != nil {
		return []DateWindow{}
	}
	last, err := ParseDate(dates[len(dates)-1])
	if err != nil {
		return []DateWindow{}
	}
	span := DaysBetween(first, last)

	candidates := make([]DateWindow, 0)

	for i := 0; i < span; i++ {
		start := first.AddDate(0, 0, i)
		startMarks, ok := byDate[FormatDate(start)]
		if !ok {
			continue
		}

		free := copySet(startMarks.free)
		loose := union(startMarks.free, startMarks.maybe)

		for j := i; j < span; j++ {
			end := first.AddDate(0, 0, j)
			if j > i {
				marks, ok := byDate[FormatDate(end)]
				if !ok {
					break
				}
				free = intersect(free, marks.free)
				loose = intersect(loose, union(marks.free, marks.maybe))
			}
			if len(loose) < 2 {
				break
			}

			days := j - i + 1
			if days < minDays {
				continue
			}
			freeIDs := keys(free)
			if len(freeIDs) == 0 {
				continue
			}

			maybeIDs := make([]string, 0)
			for _, id := range keys(loose) {
				if !free[id] {
					maybeIDs = append(maybeIDs, id)
				}
			}

			candidates = append(candidates, DateWindow{
				ID:             FormatDate(start) + "_" + FormatDate(end),
				StartDate:      FormatDate(start),
				EndDate:        FormatDate(end),
				Days:           days,
				MemberIDs:      freeIDs,
				MaybeMemberIDs: maybeIDs,
				Everyone:       len(freeIDs) == total,
				Score:          windowScore(days, len(freeIDs), total, start),
				Reason:         windowReason(days, freeIDs, maybeIDs, total, start),
			})
		}
	}

	// Longest first, so a shorter run with the same member-set is recognised as
	// contained and dropped.
	sort.SliceStable(candidates, func(a, b int) bool { return candidates[a].Days > candidates[b].Days })

	kept := make([]DateWindow, 0, len(candidates))
	byMembers := make(map[string][]DateWindow)

	for _, candidate := range candidates {
		key := joinKeys(candidate.MemberIDs)
		contained := false
		for _, other := range byMembers[key] {
			if candidate.StartDate >= other.StartDate && candidate.EndDate <= other.EndDate {
				contained = true
				break
			}
		}
		if contained {
			continue
		}
		byMembers[key] = append(byMembers[key], candidate)
		kept = append(kept, candidate)
	}

	sort.SliceStable(kept, func(a, b int) bool {
		if kept[a].Score != kept[b].Score {
			return kept[a].Score > kept[b].Score
		}
		if kept[a].Days != kept[b].Days {
			return kept[a].Days > kept[b].Days
		}
		return kept[a].StartDate < kept[b].StartDate
	})

	if len(kept) > limit {
		kept = kept[:limit]
	}
	return kept
}

// MembersFreeInRange splits the group into those free on *every* day of the
// range and those who are only "maybe" somewhere inside it.
func MembersFreeInRange(
	entries []AvailabilityInput,
	memberIDs []string,
	start, end time.Time,
) (free []string, maybe []string) {
	byDate := indexEntries(entries)
	days := DaysBetween(start, end)

	for _, id := range memberIDs {
		allFree, allLoose := true, true
		for i := 0; i < days; i++ {
			marks, ok := byDate[FormatDate(start.AddDate(0, 0, i))]
			isFree := ok && marks.free[id]
			isMaybe := ok && marks.maybe[id]
			if !isFree {
				allFree = false
			}
			if !isFree && !isMaybe {
				allLoose = false
			}
		}
		switch {
		case allFree:
			free = append(free, id)
		case allLoose:
			maybe = append(maybe, id)
		}
	}
	return free, maybe
}

func copySet(in map[string]bool) map[string]bool {
	out := make(map[string]bool, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func union(a, b map[string]bool) map[string]bool {
	out := make(map[string]bool, len(a)+len(b))
	for k := range a {
		out[k] = true
	}
	for k := range b {
		out[k] = true
	}
	return out
}

func joinKeys(ids []string) string {
	sorted := append([]string(nil), ids...)
	sort.Strings(sorted)
	out := ""
	for i, id := range sorted {
		if i > 0 {
			out += ","
		}
		out += id
	}
	return out
}

/* ----------------------------------------------------------------- thai -- */

var thaiMonthsShort = [...]string{
	"ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
	"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
}

// ThaiRangeLabel renders "4–8 ธ.ค." / "28 ธ.ค. – 2 ม.ค." — used in activity
// lines, which are stored already rendered.
func ThaiRangeLabel(start, end time.Time) string {
	s, e := Day(start), Day(end)
	if s.Month() == e.Month() && s.Year() == e.Year() {
		return fmt.Sprintf("%d–%d %s", s.Day(), e.Day(), thaiMonthsShort[e.Month()-1])
	}
	return fmt.Sprintf("%d %s – %d %s",
		s.Day(), thaiMonthsShort[s.Month()-1], e.Day(), thaiMonthsShort[e.Month()-1])
}
