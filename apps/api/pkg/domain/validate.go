package domain

import (
	"fmt"
	"strconv"
	"strings"
)

// Plan validation catches the mistakes an LLM reliably makes. Every rule here
// runs on the persisted plan, not on the model output, so a hand-edited plan is
// checked the same way (DEV_SPEC §6.3 / A4.5).

type IssueSeverity string

const (
	SeverityError   IssueSeverity = "error"
	SeverityWarning IssueSeverity = "warning"
)

type Issue struct {
	Code     string        `json:"code"`
	Severity IssueSeverity `json:"severity"`
	Message  string        `json:"message"`
	DayIndex *int          `json:"day_index,omitempty"`
	ItemID   string        `json:"item_id,omitempty"`
}

// Issue codes — keep in sync with the frontend warning strings.
const (
	IssueClosedDay         = "closed_day"         // POI is shut that weekday
	IssueOutsideHours      = "outside_hours"      // visit falls outside opening hours
	IssueDayTooLong        = "day_too_long"       // exceeds the member's pace setting
	IssueTravelUnrealistic = "travel_unrealistic" // travel_min below the real distance
	IssueMustDoMissing     = "must_do_missing"    // a 'must' wish never made it in
	IssueDuplicatePOI      = "duplicate_poi"      // same POI twice in one plan
	IssueZoneHop           = "zone_hop"           // day crosses non-neighbouring zones
)

// ValidateItem is one stop, flattened for the pure check.
type ValidateItem struct {
	ID         string
	DayIndex   int
	Title      string
	StartTime  string // "HH:mm"
	EndTime    string // "HH:mm", optional
	OpenHours  string // "09:00–16:00" or free text
	TravelMin  int    // minutes to the NEXT item
	POIID      string
	Zone       string
}

// ValidateInput is a whole plan plus what it was supposed to satisfy.
type ValidateInput struct {
	Items []ValidateItem
	// Titles of 'must' wishes, so a missing one can be reported.
	MustWishes []string
	// Longest a day may run before it stops being a holiday, in minutes.
	MaxDayMinutes int
}

// ValidatePlan returns every issue found, ordered by day.
func ValidatePlan(in ValidateInput) []Issue {
	issues := make([]Issue, 0)
	if len(in.Items) == 0 {
		return issues
	}

	maxDay := in.MaxDayMinutes
	if maxDay <= 0 {
		maxDay = 12 * 60
	}

	byDay := map[int][]ValidateItem{}
	dayOrder := make([]int, 0, 8)
	for _, item := range in.Items {
		if _, seen := byDay[item.DayIndex]; !seen {
			dayOrder = append(dayOrder, item.DayIndex)
		}
		byDay[item.DayIndex] = append(byDay[item.DayIndex], item)
	}

	seenPOI := map[string]string{}

	for _, dayIndex := range dayOrder {
		items := byDay[dayIndex]
		day := dayIndex

		for i, item := range items {
			// 1. Can we physically get here from the previous stop?
			if i > 0 {
				prev := items[i-1]
				prevEnd := prev.EndTime
				if prevEnd == "" {
					prevEnd = prev.StartTime
				}
				if arrival, ok := addMinutes(prevEnd, prev.TravelMin); ok && arrival > item.StartTime {
					issues = append(issues, Issue{
						Code:     IssueTravelUnrealistic,
						Severity: SeverityWarning,
						Message:  fmt.Sprintf("เวลาชนกับ \"%s\" — ต้องออกก่อน %s ถึงจะทัน", prev.Title, arrival),
						DayIndex: &day,
						ItemID:   item.ID,
					})
				}
			}

			// 2. Is it even open?
			if open, close, ok := parseHours(item.OpenHours); ok {
				switch {
				case item.StartTime < open:
					issues = append(issues, Issue{
						Code:     IssueOutsideHours,
						Severity: SeverityWarning,
						Message:  fmt.Sprintf("ยังไม่เปิด — เปิด %s", open),
						DayIndex: &day,
						ItemID:   item.ID,
					})
				case item.StartTime > close:
					issues = append(issues, Issue{
						Code:     IssueOutsideHours,
						Severity: SeverityWarning,
						Message:  fmt.Sprintf("ปิดแล้ว — ปิด %s", close),
						DayIndex: &day,
						ItemID:   item.ID,
					})
				}
			}

			// 3. Have we already been here?
			if item.POIID != "" {
				if firstDay, seen := seenPOI[item.POIID]; seen {
					issues = append(issues, Issue{
						Code:     IssueDuplicatePOI,
						Severity: SeverityWarning,
						Message:  fmt.Sprintf("\"%s\" ซ้ำกับ%s", item.Title, firstDay),
						DayIndex: &day,
						ItemID:   item.ID,
					})
				} else {
					seenPOI[item.POIID] = fmt.Sprintf("วันที่ %d", dayIndex)
				}
			}
		}

		// 4. Is the day humane?
		if len(items) > 1 {
			first := items[0]
			last := items[len(items)-1]
			end := last.EndTime
			if end == "" {
				end = last.StartTime
			}
			if length, ok := minutesBetween(first.StartTime, end); ok && length > maxDay {
				issues = append(issues, Issue{
					Code:     IssueDayTooLong,
					Severity: SeverityWarning,
					Message:  fmt.Sprintf("วันนี้ยาว %d ชม. — เผื่อเวลาพักบ้าง", length/60),
					DayIndex: &day,
				})
			}
		}

		// 5. Does it zig-zag across the city?
		zones := map[string]bool{}
		for _, item := range items {
			if item.Zone != "" {
				zones[item.Zone] = true
			}
		}
		if len(zones) >= 3 {
			issues = append(issues, Issue{
				Code:     IssueZoneHop,
				Severity: SeverityWarning,
				Message:  fmt.Sprintf("วันนี้ข้าม %d โซน — เสียเวลาเดินทางเยอะ", len(zones)),
				DayIndex: &day,
			})
		}
	}

	// 6. Did anything anyone insisted on get dropped?
	for _, wish := range in.MustWishes {
		normalised := NormalizeName(wish)
		found := false
		for _, item := range in.Items {
			if namesMatch(normalised, NormalizeName(item.Title)) {
				found = true
				break
			}
		}
		if !found {
			issues = append(issues, Issue{
				Code:     IssueMustDoMissing,
				Severity: SeverityError,
				Message:  fmt.Sprintf("\"%s\" เป็นสิ่งที่ต้องไป แต่ยังไม่อยู่ในแพลน", wish),
			})
		}
	}

	return issues
}

// WarningsByItem flattens the issues into the one-line-per-item shape the
// timeline card renders.
func WarningsByItem(issues []Issue) map[string]string {
	out := make(map[string]string, len(issues))
	for _, issue := range issues {
		if issue.ItemID == "" {
			continue
		}
		if _, exists := out[issue.ItemID]; exists {
			continue // first issue wins; a card shows one line
		}
		out[issue.ItemID] = issue.Message
	}
	return out
}

/* ----------------------------------------------------------------- time -- */

func parseClock(hhmm string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(hhmm), ":")
	if len(parts) != 2 {
		return 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

func addMinutes(hhmm string, minutes int) (string, bool) {
	total, ok := parseClock(hhmm)
	if !ok {
		return "", false
	}
	total = (total + minutes) % (24 * 60)
	return fmt.Sprintf("%02d:%02d", total/60, total%60), true
}

func minutesBetween(start, end string) (int, bool) {
	a, ok1 := parseClock(start)
	b, ok2 := parseClock(end)
	if !ok1 || !ok2 {
		return 0, false
	}
	if b < a {
		b += 24 * 60 // ran past midnight
	}
	return b - a, true
}

// parseHours reads "09:00–16:00" (en dash or hyphen). Anything else — "เปิด
// 24 ชม.", "ตลอดวัน" — is not a constraint we can check, and pretending
// otherwise would produce false warnings.
func parseHours(s string) (open, close string, ok bool) {
	for _, sep := range []string{"–", "-", "—"} {
		if parts := strings.Split(s, sep); len(parts) == 2 {
			open = strings.TrimSpace(parts[0])
			close = strings.TrimSpace(parts[1])
			if _, ok1 := parseClock(open); ok1 {
				if _, ok2 := parseClock(close); ok2 {
					return open, close, true
				}
			}
		}
	}
	return "", "", false
}
